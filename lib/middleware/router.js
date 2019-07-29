import http2 from "http2";
import fs from "fs";
import Path from "path";
import assert from "assert";

import traverse from "traverse";
import mime from "mime";

import {
    set,
    get
} from "../util";
import {
    HTTPError
} from "../error";
import {
    Middleware
} from "./middleware";

const {
    HTTP2_HEADER_METHOD,
    HTTP2_HEADER_STATUS,
    HTTP2_HEADER_CONTENT_TYPE,
    HTTP2_HEADER_ACCEPT,
    HTTP2_HEADER_RANGE,
    HTTP2_HEADER_CONTENT_RANGE
} = http2.constants;

const fsp = fs.promises;

// https://www.w3.org/Protocols/rfc2616/rfc2616-sec9.html
export const METHODS = [
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "CONNECT",
    "OPTIONS",
    "TRACE"
];

export class Router extends Middleware {
    constructor({
        path = "",
        // stripTrailingSlash = true
        ...rest
    } = {}) {
        super(rest);

        this.routes = {};
        this.path = path;
        this.options = {
            // stripTrailingSlash
        };
    }
    async init() {
        await super.init();
        const promises = traverse(this.routes).reduce((acc, route) => {
            if (route instanceof Middleware)
                acc.push(route.init());
            return acc;
        }, []);
        await Promise.all(promises);
    }

    async render({
        req,
        ...rest
    }) {
        const method = req.headers[HTTP2_HEADER_METHOD];

        // Remove trailing slash
        const pathname = req.url.pathname.replace(/\/$/, "");

        req.url.relative = (req.url.relative || pathname).substring(
            this.path.length
        );

        // Remove this router's path from the start
        const searchPath = removeParams(`${req.url.relative}/${method}`);

        // console.debug("Searching for", method, pathname, searchPath, this.path);

        // Try to find a route matching this request in our route tree
        let target = getPath(this.routes, searchPath);

        // Check for a passthrough route if current target is not a middleware
        if (!(target instanceof Middleware) && get(target, `**.${method}`)) {
            target = target["**"][method];
        }

        // If we find the route we should render it
        if (target instanceof Middleware) {
            // console.debug('Found middleware', target, target.path);
            return await target({
                req,
                ...rest
            });
        }
    }

    async use(...middlewares) {
        for (const middleware of middlewares) {
            // Verify that the middleware is in fact a middleware
            assert(
                middleware instanceof Middleware,
                "Cannot add non-middleware to router"
            );

            if (middleware instanceof Route || middleware instanceof Router) {
                // Remove parameters for path and add target method
                const simplifiedPath = removeParams(
                    `${middleware.path.replace(
                        /\/$/,
                        ""
                    )}/${middleware.method || "*"}`
                );

                // Add our route to the route tree so it can be found later when calling the render method
                set(this.routes, simplifiedPath, middleware, "/");
                // console.debug(`Registered ${this.path}${simplifiedPath}`);
            } else {
                await super.use(middleware);
            }
        }
    }
}

// This middleware will parse out the path params
function paramsMiddleware(paramsParser) {
    return function paramsParserMiddleware({
        req
    }) {
        // Parse out the request's path parameters
        req.params = (paramsParser.exec(req.url.pathname) || {}).groups || {};
    };
}

export class Route extends Middleware {
    constructor({
        path = "",
        method = "*",
        push = [],
        handler,
        ...rest
    }) {
        // Compile regex parser for url params
        const paramsParser = new RegExp(pathToRegex(path));

        rest.chain = [paramsMiddleware(paramsParser), ...(rest.chain || [])];
        super(rest);

        // Verify that a valid method has been provided
        assert(
            ~[...METHODS, "*"].indexOf(method),
            `${method} is not a valid HTTP method`
        );

        Object.assign(this, {
            path,
            method,
            handler,
            pushPaths: push
        });
    }
    async render({
        // stream,
        req: _req,
        res
    }) {
        // console.debug("Reached:", _req.url.path);

        // TODO: Finish push stream
        // for (const path of this.pushPaths) {
        //     await util.promisify(stream.pushStream)({':path': path});
        // }

        // Set default status code to 200 (we are inside a route so we know it's been found)
        res.headers[HTTP2_HEADER_STATUS] = 200;

        // Call the route's original handler
        return await this.handler.apply(this, arguments);
    }
}

export class Static extends Route {
    constructor({
        directory,
        path,
        jpegToWebp = true,
        method = "GET",
        ...rest
    }) {
        super({
            method,
            path: `${path}/**`,
            ...rest,
            handler: Static.handler
        });

        this.options = {
            jpegToWebp
        };
        this.directory = directory;
        this.originalPath = path;
    }
    static async handler({
        req,
        res
    }) {
        // Get filepath relative to route path
        let filepath = req.url.relative.substring(this.originalPath.length);
        let parsedPath = Path.parse(filepath);

        // Convert jpeg request to webp request if jpegToWebp is set and the client
        // accepts webp images
        if (
            this.options.jpegToWebp &&
            /\.jpe?g$/.test(parsedPath.ext) &&
            ~req.headers[HTTP2_HEADER_ACCEPT].indexOf("image/webp")
        ) {
            const parsedWebpPath = {
                dir: parsedPath.dir,
                name: parsedPath.name,
                ext: ".webp"
            };
            const webpPath = Path.format(parsedWebpPath);
            try {
                await fsp.access(webpPath);
                filepath = webpPath;
                parsedPath = parsedWebpPath;
            } catch (e) {}
        }

        // Attempt to discover mime type of file based off file extension
        res.headers[HTTP2_HEADER_CONTENT_TYPE] = parsedPath.ext ?
            mime.getType(parsedPath.ext.substring(1)) :
            "application/octet-stream";

        // Generate path on filesystem
        const systemPath = Path.join(this.directory, filepath);

        try {
            if (req.headers[HTTP2_HEADER_RANGE]) {
                const [unit, range] = req.headers[HTTP2_HEADER_RANGE].split("=");
                assert(unit === "bytes", "only bytes unit allowed for range header");
                const {size} = fsp.stat(systemPath);
                const [start, end = size] = range.split("-").map(parseInt);
                if (start >= end || end - start > size || end > size) {
                    res.headers[HTTP2_HEADER_CONTENT_RANGE] = `bytes 0-${size}/${size}`;
                    throw new HTTPError(416);
                }
                const buffer = end ? Buffer.alloc(end - start) : Buffer.alloc(size - start);
                const fd = await fsp.open(systemPath);
                const {bytesRead: _} = await fsp.read(fd, buffer, start, buffer.length, start);
                res.body = buffer;
            } else {
            // Read file into response body
                res.body = await fsp.readFile(systemPath);
                res.headers[HTTP2_HEADER_STATUS] = 206;
            }
        } catch (error) {
            // These errors mean the file does not exist
            if (~["ENOTDIR", "ENOENT"].indexOf(error.code))
                throw new HTTPError(404, undefined, error);
            throw error;
        }

        return Middleware.DONE;
    }
}

function removeParams(path) {
    return path.replace(/\{.+?\}/g, "*");
}

function pathToRegex(path) {
    return (
        path.replace(/\*+/g, ".*?").replace(/\{(.+?)\}/g, "(?<$1>.*?)") +
        "(\\/|$)"
    );
}

function getPath(object, path) {
    let xs = object;
    for (const x of path.split("/")) {
        // console.debug(Object.keys(xs), x);
        if (!(xs[x] || xs["*"])) return xs;
        xs = xs[x] || xs["*"];
    }
    return xs;
}
