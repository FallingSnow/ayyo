import http2 from "http2";
import ReadableStreamClone from "readable-stream-clone";

import XXHash from "xxhash";
import luxon from "luxon";
const { DateTime } = luxon;

import {Middleware} from "./middleware.mjs";

const {
  // CACHE headers
  HTTP2_HEADER_CACHE_CONTROL,
  HTTP2_HEADER_EXPIRES,
  HTTP2_HEADER_AGE,
  HTTP2_HEADER_ETAG,
  HTTP2_HEADER_LAST_MODIFIED,
  HTTP2_HEADER_IF_MATCH,
  HTTP2_HEADER_STATUS
} = http2.constants;

export class Cache extends Middleware {
  constructor({
    maxAge = 31536000,
    weak = true,
    ...rest
  } = {}) {
    super(rest);

    Object.assign(this, {
      maxAge,
      weak
    });
  }

  async render({req, res}) {
    await super.apply(this, arguments);

    let etag = res.etag || "0";

    // console.log(etag, res.body, this.weak)
    if (etag === 0 && res.body && !this.weak) {
      etag = await new Promise((resolve, reject) => {
        if (res.body.pipe) {
          const hasher = new XXHash.Stream(0xCAFEBABE);

          new ReadableStreamClone(res.body)
            .pipe(hasher)
            .once("error", reject)
            .once("finish", () => resolve(hasher.read()));
          res.body = new ReadableStreamClone(res.body);
        } else {
          try {
            const hasher = new XXHash(0xCAFEBABE);
            hasher.update(JSON.stringify(res.body));
            return resolve(hasher.digest());
          } catch (error) {
            return reject(error);
          }
        }
      });
    }

    if (req.headers[HTTP2_HEADER_IF_MATCH]) {
      const matches = req.headers[HTTP2_HEADER_IF_MATCH].split(",").filter(m => !m.startsWith("W/")).map(m => m.trim());
      if (matches.indexOf(etag) > -1) {
        res.headers[HTTP2_HEADER_STATUS] = 304;
        delete res.body;
      }
    }

    const expiresDate = DateTime.local();
    expiresDate.plus(this.maxAge);

    if (this.maxAge)
      res.headers[HTTP2_HEADER_CACHE_CONTROL] = `max-age=${this.maxAge}`;

    res.headers[HTTP2_HEADER_EXPIRES] = expiresDate.toHTTP();
    res.headers[HTTP2_HEADER_ETAG] = `${this.weak ? "W/" : ""}"${etag}"`;
  }
}
