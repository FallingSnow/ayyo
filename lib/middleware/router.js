import http2 from "http2";
import fs from "fs";
import Path from "path";
import assert from "assert";

import mime from "mime";

import {set, get} from "../util";
import {HTTPError} from "../error";
import {Middleware} from "./middleware";

const {
    HTTP2_HEADER_METHOD,
    HTTP2_HEADER_STATUS,
    HTTP2_HEADER_CONTENT_TYPE
} = http2.constants;

const fsp = fs.promises;

// https://www.w3.org/Protocols/rfc2616/rfc2616-sec9.html
export const METHODS = [
    "GET",
    "HEAD",
    "POST",
    "PUT",
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

    async render({req, ...rest}) {
        await super.render.apply(this, arguments);

        const method = req.headers[HTTP2_HEADER_METHOD];

        // Remove trailing slash
        const pathname = req.url.pathname.replace(/\/$/, "");

        req.url.relative = (req.url.relative || pathname).substring(
            this.path.length
        );

        // Remove this router's path from the start
        const searchPath = removeParams(`${req.url.relative}/${method}`);

        // console.debug("Searching for", method, pathname, searchPath);

        // Try to find a route matching this request in our route tree
        let target = getPath(this.routes, searchPath);

        // Check for a passthrough route if current target is not a middleware
        if (!(target instanceof Middleware) && get(target, `**.${method}`)) {
            target = target["**"][method];
        }

        // If we find the route we should render it
        if (target instanceof Middleware) {
            // console.debug('Found middleware', target, target.path);
            await target({
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
                // console.debug(`Registered ${simplifiedPath}`);
            } else {
                await super.use(middleware);
            }
        }
    }
}

export class Route extends Middleware {
    constructor({path = "", method = "*", push = [], handler, ...rest}) {
        super(rest);

        // Verify that a valid method has been provided
        assert(
            ~[...METHODS, "*"].indexOf(method),
            `${method} is not a valid HTTP method`
        );
        // Compile regex parser for url params
        const paramsParser = new RegExp(pathToRegex(path));

        Object.assign(this, {
            path,
            method,
            handler,
            pushPaths: push,
            paramsParser
        });
    }
    async render({
        // stream,
        req,
        res
    }) {
        await super.render.apply(this, arguments);
        // console.debug("Reached:", req.url.path);

        // TODO: Finish push stream
        // for (const path of this.pushPaths) {
        //     await util.promisify(stream.pushStream)({':path': path});
        // }

        // Set default status code to 200 (we are inside a route so we know it's been found)
        res.headers[HTTP2_HEADER_STATUS] = 200;

        // Parse out the request's path parameters
        req.params = (this.paramsParser.exec(req.url.pathname) || {}).groups;

        // Call the route's original handler
        await this.handler.apply(this, arguments);
    }
}

export class Static extends Route {
    constructor({directory, path, method = "GET", ...rest}) {
        super({method, path: `${path}/**`, ...rest});
        this.directory = directory;
        this.originalPath = path;
    }
    async render({req, res}) {
        // Get filepath relative to route path
        const filepath = req.url.relative.substring(this.originalPath.length);

        // Generate path on filesystem
        const systemPath = Path.join(this.directory, filepath);

        try {
            // Read file into response body
            res.body = await fsp.readFile(systemPath);
            res.headers[HTTP2_HEADER_STATUS] = 200;
        } catch (error) {
            if (error.code === "ENOENT")
                throw new HTTPError(404, undefined, error);
            throw error;
        }

        // Attempt to discover mime type of file based off file extension
        const parsedPath = Path.parse(filepath);
        if (parsedPath.ext) {
            const type = mime.getType(parsedPath.ext.substring(1));
            if (type) res.headers[HTTP2_HEADER_CONTENT_TYPE] = type;
        }
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
        if (!(xs[x] || xs["*"])) return xs;
        xs = xs[x] || xs["*"];
    }
    return xs;
}
