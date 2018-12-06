import http2 from "http2";

import {DONE} from "../symbols";
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
        headers,
        methods,
        maxAge = 1728000,
        allowCredentials,
        ...rest
    } = {}) {
        super(rest);

        this.options = {
            origin,
            headers,
            methods,
            maxAge,
            allowCredentials,
        };
    }

    async render({req, res}) {
        await super.apply(this, arguments);

        const method = req.headers[HTTP2_HEADER_METHOD];
        if (method === "OPTIONS") {
            res.headers[HTTP2_HEADER_STATUS] = 200;
            res.body = "";

            if (this.options.origin)
                res.headers[
                    HTTP2_HEADER_ACCESS_CONTROL_ALLOW_ORIGIN
                ] = this.options.origin;

            if (this.options.headers)
                res.headers[HTTP2_HEADER_ACCESS_CONTROL_ALLOW_HEADERS] =
                    this.options.headers === true
                        ? "Origin, X-Requested-With, Content-Type, Accept"
                        : this.options.header;

            if (this.options.methods)
                res.headers[HTTP2_HEADER_ACCESS_CONTROL_ALLOW_METHODS] =
                    this.options.methods === true
                        ? METHODS.join(",")
                        : this.options.header;

            if (this.options.maxAge)
                res.headers[
                    HTTP2_HEADER_ACCESS_CONTROL_MAX_AGE
                ] = this.options.maxAge;
            if (typeof this.options.allowCredentials !== 'undefined')
                res.headers[
                    HTTP2_HEADER_ACCESS_CONTROL_ALLOW_CREDENTIALS
                ] = this.options.allowCredentials;
            return DONE;
        }
    }

    async use(...middlewares) {
        for (const middleware of middlewares) {
            await super.use(middleware);
        }
    }
}
