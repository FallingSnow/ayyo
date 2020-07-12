import http2 from "http2";
import fs from "fs";
import Path from "path";
import assert from "assert";

import traverse from "traverse";
import mime from "mime";
import PTR from "path-to-regexp";
const { pathToRegexp } = PTR;

import {
  set,
  get
} from "../util/index.mjs";
import {
  HTTPError
} from "../error.mjs";
import {
  Middleware
} from "./middleware.mjs";

const {
  HTTP2_HEADER_METHOD,
  HTTP2_HEADER_STATUS,
  HTTP2_HEADER_CONTENT_TYPE,
  HTTP2_HEADER_ACCEPT,
  HTTP2_HEADER_RANGE,
  HTTP2_HEADER_CONTENT_RANGE,
  HTTP2_HEADER_CONTENT_LENGTH,
  HTTP2_HEADER_PATH,
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
    ...rest
  } = {}) {
    super(rest);

    this.routes = {};
    this.path = normalizePath(path);
  }
  async init(...args) {
    await super.init();
    const promises = traverse(this.routes).reduce((acc, route) => {
      if (route instanceof Middleware)
        acc.push(route.init.apply(this, args));
      return acc;
    }, []);
    await Promise.all(promises);
  }

  async render({
    req,
    ...rest
  }) {
    await super.apply(this, arguments);
    const method = req.headers[HTTP2_HEADER_METHOD].toUpperCase();

    const pathname = req.url.pathname;
    req.url.relative = normalizePath(removeParams(pathname).substring(this.path.length));

    // Remove this router's path from the start
    const searchPath = normalizePath(req.url.relative + `/${method}`);

    // console.debug("Searching for", {method, pathname, relative: req.url.relative, searchPath, path: this.path, tree: _propertiesToArray(this.routes)});

    // Try to find a route matching this request in our route tree
    let target = getPath(this.routes, searchPath);

    // Check for a passthrough route if current target is not a middleware
    if (!(target instanceof Middleware) && get(target, `*.${method}`)) {
      target = target["*"][method];
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

      if (middleware instanceof Route) {
        const paths = Array.isArray(middleware.path) ? middleware.path : [middleware.path];
        for (const path of paths) {
          const simplifiedPath =
          // Remove parameters for path and add target method
            normalizePath(removeParams(`${path}/${middleware.method}`));

          // console.debug("Route initialized", this.path, simplifiedPath);
          // Add our route to the route tree so it can be found later when calling the render method
          set(this.routes, simplifiedPath, middleware, "/");
        }

      } else if (middleware instanceof Router) {
        middleware.path = normalizePath(`${this.path}/${middleware.path}`);
        set(this.routes, middleware.path, middleware, "/");

      } else {
        // console.debug("Added middleware to router:", middleware.constructor.name);
        await super.use(middleware);
      }
    }
  }
}

const pathRegexGenerator = pathToRegexpFactory({endsWith: "/"});
export class Route extends Middleware {
  constructor({
    path = "",
    method = "*",
    push = [],
    handler,
    ...rest
  }) {
    path = normalizePath(path);
    // Compile regex parser for url params
    const pathRegex = pathRegexGenerator(path);

    super(rest);

    // Verify that a valid method has been provided
    assert(
      ~[...METHODS, "*"].indexOf(method),
      `${method} is not a valid HTTP method`
    );

    Object.assign(this, {
      pathRegex,
      path,
      method: method.toUpperCase(),
      handler,
      pushPaths: push
    });
  }
  async render({
    server,
    stream,
    req,
    res
  }) {
    req.params = this.pathRegex(normalizePath(req.url.relative || req.url.pathname));
    // console.debug("Reached:", _req.url.path);

    // TODO: Finish push stream
    if (stream.pushAllowed) {
      for (const path of this.pushPaths) {
        const [pushStream, headers] = await stream.pushStreamPromise({[HTTP2_HEADER_PATH]: path});
        server.emit("stream", pushStream, headers);
      }
    }

    // Set default status code to 200 (we are inside a route so we know it's been found)
    res.headers[HTTP2_HEADER_STATUS] = 200;

    // Call the route's original handler
    return await this.handler.apply(this, arguments);
  }
}

export class Static extends Route {
  constructor({
    directory,
    path = "/",
    jpegToWebp = true,
    method = "GET",
    fallbackPath,
    baseFilePath = "index.html",
    ...rest
  }) {
    super({
      method,
      path: [normalizePath(path), normalizePath(`${path}/(.*)`)],
      handler: Static.handler,
      ...rest
    });

    this.options = {
      jpegToWebp
    };
    this.directory = directory;
    this.fallbackPath = fallbackPath;
    this.baseFilePath = baseFilePath;
    this.originalPath = path;
  }
  static async handler({
    req,
    res
  }) {
    // Get filepath relative to route path
    let filepath = decodeURIComponent((typeof req.url.relative !== "undefined" ? req.url.relative : req.url.pathname).substring(this.originalPath.length)) || this.baseFilePath;
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
        // eslint-disable-next-line no-empty
      } catch (e) {}
    }

    // Generate path on filesystem
    const systemPath = Path.join(this.directory, filepath);

    try {
      if (req.headers[HTTP2_HEADER_RANGE]) {
        const [unit, range] = req.headers[HTTP2_HEADER_RANGE].split("=");
        assert(unit === "bytes", "only bytes unit allowed for range header");
        const fileHandle = await fsp.open(systemPath);
        const {size} = await fileHandle.stat(systemPath);
        await fileHandle.close();
        let [start, end] = range.split("-").map(a => parseInt(a));
        if (isNaN(end))
          end = size;
        if (start >= end || end - start > size || end > size) {
          res.headers[HTTP2_HEADER_CONTENT_RANGE] = `bytes 0-${size}/${size}`;
          throw new HTTPError(416);
        }
        res.headers[HTTP2_HEADER_CONTENT_LENGTH] = end - start;
        res.headers[HTTP2_HEADER_STATUS] = 206;

        // Attempt to discover mime type of file based off file extension

        res.body = fs.createReadStream(systemPath, {start, end});
      } else {
        try {
          await fsp.access(systemPath);
          res.body = fs.createReadStream(systemPath);
        } catch (e) {
          if (!this.fallbackPath)
            throw e;
          const fallbackPath = Path.join(this.directory, this.fallbackPath);
          await fsp.access(fallbackPath);
          res.body = fs.createReadStream(fallbackPath);
          parsedPath = Path.parse(fallbackPath);
        }
      }
    } catch (error) {
      // These errors mean the file does not exist
      if (~["ENOTDIR", "ENOENT"].indexOf(error.code))
        throw new HTTPError(404, undefined, error);
      throw error;
    } finally {
      if (parsedPath.ext)
        res.headers[HTTP2_HEADER_CONTENT_TYPE] = mime.getType(parsedPath.ext.substring(1));
    }

    // return Middleware.DONE;
  }
}

function removeParams(path) {
  return path.replace(/:.+?\//g, "*/").replace(/\(\.\*\)\//g, "**/");
}

function getPath(object, path) {
  let xs = object;
  for (const x of path.split("/")) {
    // console.debug(Object.keys(xs), x);
    if (!(xs[x] || xs["*"] || xs["**"])) return xs;
    xs = xs[x] || xs["*"] || (xs["**"] ? xs : undefined);
  }
  return xs;
}

// https://github.com/pillarjs/path-match#readme
function pathToRegexpFactory(options = {}) {
  return function generator(path) {
    var keys = [];
    var re = pathToRegexp(path, keys, options);

    return function parser(pathname, params) {
      var m = re.exec(pathname);
      if (!m) return false;

      params = params || {};

      var key, param;
      for (var i = 0; i < keys.length; i++) {
        key = keys[i];
        param = m[i + 1];
        if (!param) continue;
        params[key.name] = decodeURIComponent(param);
        if (key.repeat) params[key.name] = params[key.name].split(key.delimiter);
      }

      return params;
    };
  };
}

function _propertiesToArray(obj) {
    const isObject = val =>
        typeof val === "object" && !Array.isArray(val);

    const addDelimiter = (a, b) =>
        a ? `${a}.${b}` : b;

    const paths = (obj = {}, head = "") => {
        return Object.entries(obj)
            .reduce((product, [key, value]) =>
                {
                    let fullPath = addDelimiter(head, key);
                    return isObject(value) ?
                        product.concat(paths(value, fullPath))
                    : product.concat(fullPath);
                }, []);
    };

    return paths(obj);
}

function normalizePath(path) {
  if (Array.isArray(path)) {
    return path.map(p => "/" + p.replace(/\/+/g, "/").replace(/^\/|\/$/g, ""));
  } else {
    return "/" + path.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
  }
}
