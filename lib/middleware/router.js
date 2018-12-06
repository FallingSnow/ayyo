import http2 from "http2";
import assert from "assert";

import {set} from "../util";
import {Middleware} from "./middleware";

const {
    HTTP2_HEADER_METHOD,
    HTTP2_HEADER_STATUS,
} = http2.constants;

// const fsp = fs.promises;

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

    async render({req, ...rest}, searchPath) {
        await super.render.apply(this, arguments);

        const method = req.headers[HTTP2_HEADER_METHOD];
        const pathname = req.url.pathname.replace(/\/$/, "");

        // Remove this router's path from the start
        searchPath = (
            searchPath || removeParams(`${pathname}/${method}`)
        ).substring(this.path.length);

        // console.debug("Searching for", method, pathname, searchPath);

        // Try to find a route matching this request in our route tree
        const target = get(this.routes, searchPath);

        // If we find the route we should render it
        if (target instanceof Middleware) {
            // console.debug('Found middleware', target, target.path);
            await target({
                req,
                ...rest
            }, searchPath);
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

function removeParams(path) {
    return path.replace(/\{.+?\}/g, "*");
}

function pathToRegex(path) {
    return path.replace(/\{(.+?)\}/g, "(?<$1>.*?)") + "(\\/|$)";
}

function get(object, path) {
    let xs = object;
    for (const x of path.split("/")) {
        if (!xs[x])
            return xs["*"];
        xs = xs[x];
    }
    return xs;
}
