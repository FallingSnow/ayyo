import http2 from "http2";
import fs from "fs";
import { extname } from "path";
import { promisify } from "util";
import assert from "assert";

import fileType from "file-type";
import selfsigned from "selfsigned";
import mime from "mime";

import { HTTPError } from "./error";
import Request from "./request";
import Response from "./response";
import { Middleware } from "./middleware";


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
    http2Options = { allowHTTP1: true },
    http1Handler = (req, res) => {
      res.writeHead(505, { "Content-Type": "text/plain" });
      res.end("Http1 protocol not supported. Use another client.");
    },
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
      if (this.onError) {
        return this.onError(error, "sessionError");
      }
      // eslint-disable-next-line no-console
      console.error("A critical session error occured:", error);
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
  /**
     *
     */
  async onStream(stream, headers, flags) {

    stream.on("error", error => {
      if (this.onError) {
        return this.onError(error, "streamError");
      }
      // eslint-disable-next-line no-console
      console.error("A critical session error occured:", error);
    });
    stream.on("frameError", error => {
      if (this.onError) {
        return this.onError(error, "streamFrameError");
      }
      // eslint-disable-next-line no-console
      console.error("A critical session frame error occured:", error);
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
      if (typeof res.file !== "undefined")
        assert(["string", "number"].includes(typeof res.file), "res.file must be a file path string or file descriptor number");
    } catch (error) {
      return await this._onError({
        stream,
        req,
        res,
        error
      });
    }

    if (res.file) {
      // We are sending a file
      if (typeof res.file === "number")
        return stream.respondWithFD(res.file, res.headers, {onError: error => this._fileSendError({stream, req, res, error})});
      else
        return stream.respondWithFile(res.file, res.headers, {onError: error => this._fileSendError({stream, req, res, error})});
    }

    try {
      await this._endStream({stream, req, res});
    } catch (error) {
      if (this.onError) {
        return this.onError(error);
      }
      // eslint-disable-next-line no-console
      console.error("A critical error occured while trying to end a stream:", error);
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
      if (this.onError) {
        return this.onError(error);
      }
      // eslint-disable-next-line no-console
      console.error("A critical error occured while trying send an error message:", error);
    }
  }


  async _endStream({stream, res}) {

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

    if (!res.headers[HTTP2_HEADER_CONTENT_TYPE] && typeof res.file === "string") {
      const contentType = mime.getType(extname(res.file));
      res.headers[HTTP2_HEADER_CONTENT_TYPE] = contentType;
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
      await middleware.init();
    }
  }
}
