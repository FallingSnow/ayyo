import http2 from "http2";
import zlib from "zlib";
import { promisify } from "util";
import { pipeline, PassThrough } from "stream";

import {Middleware} from "./middleware";

const {
  // ENCODING headers
  HTTP2_HEADER_CONTENT_ENCODING,
  HTTP2_HEADER_ACCEPT_ENCODING,
} = http2.constants;

const ALGORITHMS = {
  stream: {
    deflate: zlib.createDeflate,
    br: zlib.createBrotliCompress,
    gzip: zlib.createGzip,
  },
  buffer: {
    deflate: promisify(zlib.deflate),
    br: promisify(zlib.brotliCompress),
    gzip: promisify(zlib.gzip),
  }
};

const ALGO_QUALITY = {
  deflate: "0.1",
  gzip: "1.0",
  br: "0.9",
};

// TODO: Handle res.file
export class Compress extends Middleware {
  constructor({
    algorithms = new Set(Object.keys(ALGO_QUALITY)),
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
      .sort((a, b) => b.quality - a.quality);

    for (const {encoding} of acceptedEncodings) {
      if (this.algorithms.has(encoding)) {

        res.headers[HTTP2_HEADER_CONTENT_ENCODING] = encoding;
        // If body is a stream
        // if (res.body.pipe) {
        const pass = new PassThrough();
        pipeline(res.body, ALGORITHMS.stream[encoding](), pass, error => error && server._onError.apply(this, {...arguments[0], error}));
        res.body = pass;
        // }
        //  else {
        //   res.body = await ALGORITHMS.buffer[encoding](res.body);
        // }

        break;
      }
    }
  }
}
