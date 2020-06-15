import http2 from "http2";

import {DateTime} from "luxon";
import XXHash from "xxhash";

import {METHODS} from "./router";
import {Middleware} from "./middleware";

const {
  // CACHE headers
  HTTP2_HEADER_CACHE_CONTROL,
  HTTP2_HEADER_EXPIRES,
  HTTP2_HEADER_AGE,
  HTTP2_HEADER_ETAG,
  HTTP2_HEADER_LAST_MODIFIED,
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

    let etag = res.etag || '0';

    // if (!etag && res.body) {
    //   const hasher = res.body.pipe ? new HashStream(0xCAFEBABE) : new XXHash(0xCAFEBABE);
    //   if (res.body.pipe) {
    //     this.body.pipe(hasher);
    //   }
    // }

    const expiresDate = DateTime.local();
    expiresDate.plus(this.maxAge);

    if (this.maxAge)
      res.headers[HTTP2_HEADER_CACHE_CONTROL] = `max-age=${this.maxAge}`;

    res.headers[HTTP2_HEADER_EXPIRES] = expiresDate.toHTTP();
    res.headers[HTTP2_HEADER_ETAG] = `${this.weak ? 'W/' : ''}"${etag}"`
  }
}
