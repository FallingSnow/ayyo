import http2 from "http2";

import {METHODS} from "./router";
import {Middleware} from "./middleware";

// HTTP2_HEADER_ACCESS_CONTROL_ALLOW_CREDENTIALS: 'access-control-allow-credentials',
// HTTP2_HEADER_ACCESS_CONTROL_ALLOW_HEADERS: 'access-control-allow-headers',
// HTTP2_HEADER_ACCESS_CONTROL_ALLOW_METHODS: 'access-control-allow-methods',
// HTTP2_HEADER_ACCESS_CONTROL_ALLOW_ORIGIN: 'access-control-allow-origin',
// HTTP2_HEADER_ACCESS_CONTROL_EXPOSE_HEADERS: 'access-control-expose-headers',
// HTTP2_HEADER_ACCESS_CONTROL_MAX_AGE: 'access-control-max-age',
// HTTP2_HEADER_ACCESS_CONTROL_REQUEST_HEADERS: 'access-control-request-headers',
// HTTP2_HEADER_ACCESS_CONTROL_REQUEST_METHOD: 'access-control-request-method',

const {
  HTTP2_HEADER_METHOD,
  HTTP2_HEADER_STATUS,
  HTTP2_HEADER_HOST,

  // Access control headers
  HTTP2_HEADER_ACCESS_CONTROL_ALLOW_ORIGIN,
  HTTP2_HEADER_ACCESS_CONTROL_ALLOW_HEADERS,
  HTTP2_HEADER_ACCESS_CONTROL_ALLOW_METHODS,
  HTTP2_HEADER_ACCESS_CONTROL_MAX_AGE,
  HTTP2_HEADER_ACCESS_CONTROL_ALLOW_CREDENTIALS
} = http2.constants;

export class Cors extends Middleware {
  constructor({
    origin = "*",
    headers = true,
    methods,
    maxAge = 1728000,
    credentials,
    ...rest
  } = {}) {
    super(rest);

    this.options = {
      origin,
      headers,
      methods,
      maxAge,
      credentials
    };
  }

  async render({req, res}) {
    await super.apply(this, arguments);

    if (this.options.origin)
      if (
        this.options.origin === true ||
                (Array.isArray(this.options.origin) &&
                    ~this.options.origin.indexOf(
                      req.headers.origin || req.headers[HTTP2_HEADER_HOST]
                    ))
      )
        res.headers[HTTP2_HEADER_ACCESS_CONTROL_ALLOW_ORIGIN] =
                    req.headers.origin || req.headers[HTTP2_HEADER_HOST];
      else if (this.options.origin === "*")
        res.headers[
          HTTP2_HEADER_ACCESS_CONTROL_ALLOW_ORIGIN
        ] = this.options.origin;

    if (this.options.headers)
      res.headers[HTTP2_HEADER_ACCESS_CONTROL_ALLOW_HEADERS] =
                this.options.headers === true
                  ? "Origin, X-Requested-With, Content-Type, Accept, Authorization"
                  : this.options.headers;

    if (this.options.methods)
      res.headers[HTTP2_HEADER_ACCESS_CONTROL_ALLOW_METHODS] =
                this.options.methods === true
                  ? METHODS.join(",")
                  : this.options.methods;

    if (this.options.maxAge)
      res.headers[
        HTTP2_HEADER_ACCESS_CONTROL_MAX_AGE
      ] = this.options.maxAge;
    if (typeof this.options.credentials !== "undefined")
      res.headers[
        HTTP2_HEADER_ACCESS_CONTROL_ALLOW_CREDENTIALS
      ] = this.options.credentials;

    // // If method is OPTIONS, lets respond now
    const method = req.headers[HTTP2_HEADER_METHOD];
    if (method === "OPTIONS") {
      res.headers[HTTP2_HEADER_STATUS] = 200;
      res.body = "";
      return Middleware.DONE;
    }
  }

  async use(...middlewares) {
    for (const middleware of middlewares) {
      await super.use(middleware);
    }
  }
}
