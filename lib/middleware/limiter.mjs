import http2 from "http2";

import {Middleware} from "./middleware.mjs";

const {
  HTTP2_HEADER_STATUS,
  HTTP2_HEADER_RETRY_AFTER,
  HTTP_STATUS_TOO_MANY_REQUESTS
} = http2.constants;

export class Limiter extends Middleware {
  constructor({
    rate = 100, // 100 requests
    interval = 10000, // per 10 seconds (10,000 milliseconds)
    onTooMany,
    ...rest
  } = {}) {
    super(rest);

    this.onTooMany = onTooMany;
    this.options = {
      rate,
      interval
    };
    this.resetCounts();
  }
  resetCounts() {
    this.counts = {};
    this.timer = setTimeout(this.resetCounts.bind(this), this.options.interval);

    const time = new Date();
    time.setSeconds(time.getSeconds() + (this.options.interval / 1000));
    this.timer.nextReset = time;
  }

  async render({req, res}) {
    await super.apply(this, arguments);

    this.counts[req.headers.origin] = this.counts[req.headers.origin] ? this.counts[req.headers.origin] + 1 : 1;

    if (this.counts[req.headers.origin] > this.options.rate) {
      res.headers[HTTP2_HEADER_STATUS] = HTTP_STATUS_TOO_MANY_REQUESTS;
      res.headers[HTTP2_HEADER_RETRY_AFTER] = this.timer.nextReset.toUTCString();
      await this.onTooMany.apply(this, arguments);
      return Middleware.DONE;
    }
  }

  async use(...middlewares) {
    for (const middleware of middlewares) {
      await super.use(middleware);
    }
  }
}
