import http2 from "http2";
import fs from "fs";
import { extname } from "path";
import { promisify } from "util";

import fileType from "file-type";
import selfsigned from "selfsigned";
import mime from "mime";
import { isMainThread, parentPort, threadId } from "worker_threads";

import { HTTPError } from "./error.mjs";
import Request from "./request.mjs";
import Response from "./response.mjs";
import { Middleware } from "./middleware/index.mjs";


const {
  HTTP2_HEADER_STATUS,
  HTTP2_HEADER_CONTENT_TYPE,
  HTTP2_HEADER_CONTENT_LENGTH
} = http2.constants;

export class Server {
  constructor({
    privKey,
    cert,
    privKeyPath,
    certPath,
    pfx,
    passphrase,
    http2Options,
    http1Handler,
    selfSigned = [{ name: "commonName", value: "localhost" }],
    listener
  } = {}) {
    this.middlewares = new Set();
    this.sessions = new Set();

    let key = privKeyPath ? fs.readFileSync(privKeyPath) : privKey;
    cert = certPath ? fs.readFileSync(certPath) : cert;

    if (!(key || cert || pfx)) {
      const pems = selfsigned.generate(selfSigned, { days: 365 });
      key = pems.private;
      cert = pems.cert;
    }
    this.listener = listener || http2.createSecureServer({
      key,
      cert,
      pfx,
      passphrase,
      ...http2Options
    }, http1Handler);

    // Cluster message handling
    if (!isMainThread) {
      parentPort.on("message", msg => {
        msg.receivingThreadId = threadId;
        if (msg.type === "close")
        // eslint-disable-next-line no-console
          this.close().catch(console.error);
      });
      this.listener.once("listening", () => {
        const message = {type: "listening"};
        const address = this.listener.address();
        if (typeof address === "string") {
          message.address = address;
        } else {
          Object.assign(message, address);
        }
        parentPort.postMessage(message);
      });
    }

    // Handle a new connection to the http2 server
    this.listener.on("stream", async (...args) => {
      try {
        await this.onStream.apply(this, args);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Unhandleable stream error:", e);
      }
    });

    this.listener.on("unknownProtocol", socket => {
      // Passing an error in the destroy method causes the server to end, need to see why...
      socket.destroy(/*new Error("Protocol not supported")*/);
    });

    // Keep a list of sessions that have connected
    this.listener.on("session", session => {
      this.sessions.add(session);
      session.once("close", () => this.sessions.delete(session));
    });

    // Keep a list of sessions that have connected
    this.listener.on("sessionError", error => {
      error.errorType = "sessionError";
      this._onError(error, "sessionError");
    });

    this.listen = promisify(this.listener.listen.bind(this.listener));
    this._close = promisify(this.listener.close.bind(this.listener));
  }
  async close() {
    for (const session of this.sessions) {
      session.close();
    }
    await this._close();
  }

  async onStream(stream, headers, flags) {
    stream.startTime = process.hrtime.bigint();

    if (stream.pushAllowed) {
      stream.pushStreamPromise = promisify(stream.pushStream);
    }

    stream.on("error", error => {
      error.errorType = "streamError";
      this._onError(error);
    });
    stream.on("frameError", error => {
      error.errorType = "streamFrameError";
      this._onError(error);
    });
    stream.once("close", () => {
      stream.endTime = process.hrtime.bigint();
    });

    // This is a really sad fix for hanging calls
    // See https://github.com/nodejs/node/issues/31309
    stream.once("readable", () => {
      // Consume data
      clearTimeout(stream.pingTimeout);
      stream.pingTimeout = setTimeout(() => stream.session.ping(() => {}), 10);
      stream.once("end", () => clearTimeout(stream.pingTimeout));
    });
    let req = {
      headers,
      flags
    };
    let res = new Response(stream);

    try {
      req = new Request(headers, flags);
      await req.parseBody(stream);
      for (const middleware of this.middlewares) {
        const result = await middleware({
          server: this,
          stream,
          req,
          res
        });
        if (result === Middleware.DONE) break;
      }
      if (res.headers[HTTP2_HEADER_STATUS] === 404) {
        throw new HTTPError(404);
      }
    } catch (error) {
      return await this._onError({
        stream,
        req,
        res,
        error
      });
    }

    try {
      await this._endStream({stream, req, res});
    } catch (error) {
      await this._onError({stream, req, res, error});
    }
  }


  async _fileSendError({stream, req, res, error}) {
    // These errors mean the file does not exist
    if (~["ENOTDIR", "ENOENT"].indexOf(error.code))
      await this._onError({stream, req, res, error: new HTTPError(404, undefined, error)});
    else
      await this._onError({stream, req, res, error});
  }


  async _onError({stream, req, res, error}) {
    try {
      // If this isn't already an HTTPError, we can assume this is an unhandled
      // error and should be treated as an internal server error
      if (!(error instanceof HTTPError)) {
        error = new HTTPError(500, undefined, error);
      }

      // Add error details to response
      res.headers[HTTP2_HEADER_STATUS] = error.code;
      res.body = error.message;

      if (this.onError)
        await this.onError.apply(this, arguments);
      else
        // eslint-disable-next-line no-console
        console.error(
          `Unable to serve request "${req.url.pathname}"`,
          error.data || error
        );

      await this._endStream({stream, req, res});
    } catch (error) {
      try {
        if (this.onError) {
          return this.onError(error);
        }
        // eslint-disable-next-line no-console
        console.error("A critical error occured while trying send an error message:", error);
      } catch (handlerError) {
        // eslint-disable-next-line no-console
        console.error("A critical error occured with the onError handler:", handlerError);
      }
    }
  }


  async _endStream({stream, res}) {

    if (!res.headers[HTTP2_HEADER_CONTENT_TYPE] && typeof res.file === "string") {
      const contentType = mime.getType(extname(res.file));
      res.headers[HTTP2_HEADER_CONTENT_TYPE] = contentType;
    }

    if (res.body && !res.body.pipe) {
      if (!res.headers[HTTP2_HEADER_CONTENT_TYPE] && res.body instanceof Buffer) {
        const type = fileType(res.body);
        if (type) {
          res.headers[HTTP2_HEADER_CONTENT_TYPE] = type.mime;
        }
      }
      if (
        !res.headers[HTTP2_HEADER_CONTENT_TYPE] &&
              typeof res.body === "object"
      ) {
        res.body = JSON.stringify(res.body);
        res.headers[HTTP2_HEADER_CONTENT_TYPE] = "application/json";
      }
      else if (!res.headers[HTTP2_HEADER_CONTENT_TYPE]) {
        res.headers[HTTP2_HEADER_CONTENT_TYPE] = "text/plain";
      }
      // If no content-length header has been registered, lets calculate the body length and set it
      if (!res.headers[HTTP2_HEADER_CONTENT_LENGTH]) {
        res.headers[HTTP2_HEADER_CONTENT_LENGTH] = Buffer.byteLength(res.body, "utf8");
      }
    }

    // We are not sending a file
    if (!stream.headersSent)
      stream.respond(res.finalHeaders());

    if (res.body && res.body.pipe) {
      return res.body.pipe(stream);
    }

    stream.end(res.body);
  }


  async use(...args) {
    for (const middleware of args) {
      this.middlewares.add(middleware);
      await middleware.init({server: this});
    }
  }
}
