import http2 from "http2";
import zlib from "zlib";
import { pipeline, PassThrough } from "stream";

import {Middleware} from "./middleware";

const {
  // ENCODING headers
  HTTP2_HEADER_CONTENT_ENCODING,
  HTTP2_HEADER_ACCEPT_ENCODING,
} = http2.constants;

const ALGORITHMS = {
  deflate: zlib.createDeflate,
  br: zlib.createBrotliCompress,
  gzip: zlib.createGzip,
};

const ALGO_QUALITY = {
  deflate: "0.8",
  gzip: "0.9",
  br: "1.0",
};

export class Compress extends Middleware {
  constructor({
    algorithms = new Set(["br", "gzip", "defalte"]),
    ...rest
  } = {}) {
    super(rest);

    this.algorithms = algorithms;
  }

  async render({req, res, server}) {
    await super.apply(this, arguments);

    if (!res.body || !res.body.pipe)
      return;

    const acceptedEncodings = req.headers[HTTP2_HEADER_ACCEPT_ENCODING]
      .split(",")
      .map(encodingQuality => {
        let [encoding, quality = ALGO_QUALITY[encoding] || "1.0"] = encodingQuality.trim().split(";q=");
        return {
          encoding,
          quality: parseFloat(quality)
        };
      })
      .sort((a, b) => a.quality - b.quality);

    for (const {encoding} of acceptedEncodings) {
      if (this.algorithms.has(encoding)) {
        const pass = new PassThrough();
        res.headers[HTTP2_HEADER_CONTENT_ENCODING] = encoding;
        pipeline(res.body, ALGORITHMS[encoding](), pass, error => error && server._onError.apply(this, {...arguments[0], error}));
        res.body = pass;
        break;
      }
    }
  }
}
