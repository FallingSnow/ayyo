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

    let etag = res.etag || "0";

    // console.log(etag, res.body, this.weak)
    if (etag === "0" && res.body && !this.weak) {
      // etag = await new Promise((resolve, reject) => {
      //   if (res.body.pipe) {
      //     const hasher = new XXHash.Stream(0xCAFEBABE);
      //     res.body.pipe(hasher).once('finish', () => resolve(hasher.read()));
      //   } else {
      //     const hasher = new XXHash(0xCAFEBABE);
      //     hasher.update(JSON.stringify(res.body));
      //     resolve(hasher.digest());
      //   }
      // });
    }

    const expiresDate = DateTime.local();
    expiresDate.plus(this.maxAge);

    if (this.maxAge)
      res.headers[HTTP2_HEADER_CACHE_CONTROL] = `max-age=${this.maxAge}`;

    res.headers[HTTP2_HEADER_EXPIRES] = expiresDate.toHTTP();
    res.headers[HTTP2_HEADER_ETAG] = `${this.weak ? 'W/' : ''}"${etag}"`
  }
}
