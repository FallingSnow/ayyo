import http2 from "http2";
import fs from "fs";
import url from "url";
import querystring from "querystring";
import {promisify} from "util";

import {HTTPError} from "./error";

const {
    HTTP2_HEADER_PATH,
    HTTP2_HEADER_STATUS,
    HTTP2_HEADER_CONTENT_TYPE
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
        this.listen = promisify(listener.listen.bind(listener));
        this.close = promisify(listener.close.bind(listener));
        this.listener.on("stream", async (...args) => {
            try {
                await this.onStream.apply(this, args);
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error("Unhandleable stream error:", e);
            }
        });
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
                [HTTP2_HEADER_STATUS]: 404,
                [HTTP2_HEADER_CONTENT_TYPE]: "text/plain"
            },
            cookies: [],
            body: "Not Found"
        };

        try {
            const parsedUrl = url.parse(headers[HTTP2_HEADER_PATH]);
            req = {
                ...req,
                url: parsedUrl,
                query: querystring.parse(parsedUrl.query),
                cookie: parseCookies(headers["cookie"]),
                body: await streamParser(
                    headers[HTTP2_HEADER_CONTENT_TYPE],
                    stream
                )
            };
            for (const middleware of this.middlewares) {
                await middleware({
                    server: this,
                    req,
                    res
                });
            }
        } catch (error) {
            // If this isn't already an HTTPError, we can assume this is an unhandled
            // error and should be treated as an internal server error
            if (!(error instanceof HTTPError)) {
                // eslint-disable-next-line no-ex-assign
                error = new HTTPError(500, undefined, error);
            }

            // Add error details to response
            res.headers[HTTP2_HEADER_STATUS] = error.statusCode;
            res.body = error.message;

            await this.onError({
                req,
                res,
                error
            });
        } finally {
            stream.respond(res.headers);
            stream.end(res.body);
        }
    }
    onError({res, error}) {
        res.body = error.data.message;
        // eslint-disable-next-line no-console
        console.error(error.data);
    }
    async use(...args) {
        for (const middleware of args) {
            this.middlewares.add(middleware);
            await middleware.init(this);
        }
    }
}

// RFC 6265 compliant cookie parsing
function parseCookies(cookies) {
    return cookies.split("; ").reduce((obj, keyVal) => {
        const [key, val] = keyVal.split(/=(.+)/);
        obj[key] = val;
        return obj;
    }, {});
}

export function collectStream(stream) {
    let buffer = "";
    return new Promise((res, rej) => {
        stream
            .on("data", chunk => (buffer += chunk))
            .on("error", rej)
            .on("end", () => res(buffer));
    });
}

async function streamParser(mime, stream) {
    switch (mime) {
        case "application/json":
            return JSON.parse(await collectStream(stream));
        default:
            return await collectStream(stream);
    }
}
