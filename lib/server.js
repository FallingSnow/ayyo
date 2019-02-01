import http2 from "http2";
import fs from "fs";
import {promisify} from "util";

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
        listener = http2.createSecureServer({
            key: privKey || fs.readFileSync(privKeyPath),
            cert: cert || fs.readFileSync(certPath),
            ...http2Options
        })
    }) {
        this.middlewares = new Set();
        this.listener = listener;
        this.listener.on("stream", async (...args) => {
            try {
                await this.onStream.apply(this, args);
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error("Unhandleable stream error:", e);
            }
        });

        this.listen = promisify(listener.listen.bind(listener));
        this.close = promisify(listener.close.bind(listener));
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
        };

        try {
            req = new Request(headers, flags);
            await req.parseBody(stream);
            for (const middleware of this.middlewares) {
                const result = await middleware({
                    server: this,
                    req,
                    res
                });
                if (result === Middleware.DONE) break;
            }
            if (res.headers[HTTP2_HEADER_STATUS] === 404) {
                throw new HTTPError(404);
            }
        } catch (error) {
            // If this isn't already an HTTPError, we can assume this is an unhandled
            // error and should be treated as an internal server error
            if (!(error instanceof HTTPError)) {
                // eslint-disable-next-line no-ex-assign
                error = new HTTPError(500, undefined, error);
            }

            // Add error details to response
            res.headers[HTTP2_HEADER_STATUS] = error.code;

            await this.onError({
                req,
                res,
                error
            });
        } finally {
            if (res.body) {
                // If no content-length header has been registered, lets calculate the body length and set it
                if (
                    !res.headers[HTTP2_HEADER_CONTENT_TYPE] &&
                    typeof res.body === "object"
                ) {
                    res.body = JSON.stringify(res.body);
                    res.headers[HTTP2_HEADER_CONTENT_TYPE] = "application/json";
                }
                if (!res.headers[HTTP2_HEADER_CONTENT_TYPE]) {
                    res.headers[HTTP2_HEADER_CONTENT_TYPE] = "text/plain";
                }
                if (!res.headers[HTTP2_HEADER_CONTENT_LENGTH]) {
                    res.headers[HTTP2_HEADER_CONTENT_LENGTH] = res.body.length;
                }
            }
            stream.respond(res.headers);
            stream.end(res.body);
        }
    }
    onError({req, res, error}) {
        res.body = error.message;
        // eslint-disable-next-line no-console
        console.error(
            `Unable to serve request "${req.url.path}"`,
            error.data || error
        );
    }
    async use(...args) {
        for (const middleware of args) {
            this.middlewares.add(middleware);
            middleware.init();
        }
    }
}
