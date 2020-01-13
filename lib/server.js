import http2 from "http2";
import fs from "fs";
import {promisify} from "util";
import assert from "assert";

import fileType from "file-type";
import selfsigned from "selfsigned";

import {HTTPError} from "./error";
import Request from "./request";
import {Middleware} from "./middleware";


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
    http2Options,
    http1Handler,
    selfSigned = [{ name: "commonName", value: "localhost" }],
    listener
  } = {}) {
    this.middlewares = new Set();
    if (!(privKey && privKeyPath && cert && certPath)) {
      const pems = selfsigned.generate(selfSigned, { days: 365 });
      privKey = pems.private;
      cert = pems.cert;
    }
    this.listener = listener || http2.createSecureServer({
      key: privKey || fs.readFileSync(privKeyPath),
      cert: cert || fs.readFileSync(certPath),
      ...http2Options
    }, http1Handler);
    this.listener.on("stream", async (...args) => {
      try {
        await this.onStream.apply(this, args);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Unhandleable stream error:", e);
      }
    });

    this.listen = promisify(this.listener.listen.bind(this.listener));
    this.close = promisify(this.listener.close.bind(this.listener));
  }
  /**
     *
     */
  async onStream(stream, headers, flags) {
    let req = {
      headers,
      flags
    };
    let res = {
      headers: {
        [HTTP2_HEADER_STATUS]: 404
      },
      cookies: [],
      write: stream.write.bind(stream)
    };

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
      await this._onError({
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

    await this._endStream({stream, req, res});
  }
  async _fileSendError({stream, req, res, error}) {
    // These errors mean the file does not exist
    if (~["ENOTDIR", "ENOENT"].indexOf(error.code))
      await this._onError({stream, req, res, error: new HTTPError(404, undefined, error)});
    else
      await this._onError({stream, req, res, error});
  }
  async _onError({stream, req, res, error}) {
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
  }
  async _endStream({stream, res}) {
    if (res.body) {
      // If no content-length header has been registered, lets calculate the body length and set it
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
      if (!res.headers[HTTP2_HEADER_CONTENT_LENGTH]) {
        res.headers[HTTP2_HEADER_CONTENT_LENGTH] = Buffer.byteLength(res.body, "utf8");
      }
    }

    // We are not sending a file
    if (!stream.headersSent)
      stream.respond(res.headers);
    stream.end(res.body);
  }
  async use(...args) {
    for (const middleware of args) {
      this.middlewares.add(middleware);
      await middleware.init();
    }
  }
}
