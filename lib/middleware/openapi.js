import http2 from "http2";
import {promisify} from "util";

import Joi from "joi";
import httpStatuses from "http-status";

import {HTTPError} from "../error";
import {deepmerge, get, set} from "../util";
import {Middleware, Router, Route} from ".";

const {HTTP2_HEADER_STATUS, HTTP2_HEADER_CONTENT_TYPE} = http2.constants;
const JoiValidateAsync = promisify(Joi.validate.bind(Joi));

export class OpenApi extends Router {
    constructor({
        serveApiPath = "/",
        serveRedocPath = "/docs",
        doc = {},
        validate,
        ...rest
    } = {}) {
        super(rest);

        this.options = {
            serveRedocPath,
            serveApiPath,
            validate: Object.assign(
                {contentType: true, requests: true, responses: true},
                validate
            )
        };

        this.doc = deepmerge(
            {
                openapi: "3.0.0",
                schemas: ["https"]
            },
            doc
        );
    }
    async init() {
        if (this.options.serveRedocPath)
            await super.use(
                new Route({
                    path: this.options.serveRedocPath,
                    method: "GET",
                    handler: ({res}) => {
                        res.headers[HTTP2_HEADER_CONTENT_TYPE] =
                            "text/html; charset=utf-8";
                        res.body = `<style>html,body{margin:0;padding:0;}</style><redoc spec-url='.${
                            this.options.serveApiPath
                        }'></redoc><script src="https://cdn.jsdelivr.net/npm/redoc/bundles/redoc.standalone.js"></script>`;
                    },
                    openapi: {
                        tags: ["api"],
                        description: "User interface for api"
                    }
                })
            );
        await super.use(
            new Route({
                path: this.options.serveApiPath,
                method: "GET",
                handler: ({res}) => {
                    res.headers[HTTP2_HEADER_CONTENT_TYPE] = "application/json";
                    res.body = JSON.stringify(this.doc);
                },
                openapi: {
                    tags: ["api"],
                    description: "API definition endpoint"
                }
            })
        );
    }
    async documentPaths(middleware, pathSegments = []) {
        // Route
        if (middleware instanceof Route) {
            const {path, method, handler, data} = middleware;

            // Get the path to this point
            const realPath = [...pathSegments, path.replace(/\/$/, "")].join(
                ""
            );

            // Apply add documentation to master doc file
            const documentedRoute = OpenApi.routeToOpenapi(
                middleware,
                realPath
            );
            set(
                this.doc,
                `paths.${realPath}.${method.toLowerCase()}`,
                documentedRoute
            );

            const originalHandler = handler;
            const options = this.options;

            // Intercept the original handler to add validation
            middleware.handler = async function handler({req, res}) {
                const contentTypes = get(
                    data,
                    "openapi.schema.consumes.contentTypes"
                );
                if (
                    options.validate.contentType &&
                    contentTypes &&
                    req.headers[HTTP2_HEADER_CONTENT_TYPE] &&
                    !~contentTypes.indexOf(
                        req.headers[HTTP2_HEADER_CONTENT_TYPE].split(";")[0]
                    )
                )
                    throw new HTTPError(400, "Invalid content type");

                // Validate request against schema
                if (options.validate.requests)
                    try {
                        const validatedValue = await OpenApi.validate(
                            get(data, "openapi.schema.consumes"),
                            req
                        );
                        Object.assign(req, validatedValue);
                    } catch (error) {
                        throw new HTTPError(400, error.toString(), error);
                    }

                const results = await originalHandler.apply(this, arguments);

                // Validate response against schema
                if (options.validate.responses)
                    try {
                        const validatedValue = await OpenApi.validate(
                            get(
                                data,
                                `openapi.schema.produces.${
                                    res.headers[HTTP2_HEADER_STATUS]
                                }`
                            ),
                            res
                        );
                        Object.assign(res, validatedValue);
                    } catch (error) {
                        throw new HTTPError(500, undefined, error);
                    }
                return results;
            };
        }

        // Router
        else if (middleware instanceof Router) {
            for (const m of Object.values(middleware.routes)) {
                await this.documentPaths(m, [...pathSegments, middleware.path]);
            }

            // Passthrough if not a middleware and an object
        } else if (
            !(middleware instanceof Middleware) &&
            typeof middleware === "object"
        ) {
            for (const m of Object.values(middleware)) {
                await this.documentPaths(m, pathSegments);
            }
        }
    }

    static routeToOpenapi({path, data}) {
        const {operationId = pathToId(path), schema = {}, ...openapi} =
            data.openapi || {};

        let parameters = [],
            requestBody,
            responses = {};

        // Convert & add path parameters to OpenAPI specification
        const pathParams = get(schema, "consumes.path");
        if (pathParams) {
            const structure = pathParams.describe().children;
            // console.debug(structure);
            parameters = [
                ...parameters,
                ...Object.keys(structure).map(name => {
                    return {
                        ...joiParameterToOpenApi({...structure[name], name}),
                        in: "path"
                    };
                })
            ];
        }

        // Convert & add query parameters to OpenAPI specification
        const queryParams = get(schema, "consumes.query");
        if (queryParams) {
            const structure = queryParams.describe().children;
            // console.debug(structure);
            parameters = [
                ...parameters,
                ...Object.keys(structure).map(name => {
                    return {
                        ...joiParameterToOpenApi({...structure[name], name}),
                        in: "query"
                    };
                })
            ];
        }

        const consumes = get(schema, "consumes.contentTypes");

        // Convert & add request body to OpenAPI specification
        const bodyParams = get(schema, "consumes.body");
        if (bodyParams) {
            const structure = bodyParams.describe();
            // console.debug(structure);
            requestBody = {
                description: structure.description,
                required:
                    get(structure, "flags.presence") === "required"
                        ? true
                        : false,
                content: consumes.reduce((obj, contentType) => {
                    obj[contentType] = {
                        schema: joiParameterToOpenApiBody(structure)
                    };
                    return obj;
                }, {})
            };
        }

        // Convert & add request body to OpenAPI specification
        let producesParams = schema.produces || {};
        for (const [
            code,
            {description = httpStatuses[code], contentType, body}
        ] of Object.entries(producesParams)) {
            responses[code] = {
                description
            };
            if (contentType && body)
                responses[code].content = {
                    [contentType]: {
                        schema: joiParameterToOpenApiBody(body.describe())
                    }
                };
        }

        return {
            operationId,
            parameters,
            responses,
            requestBody,
            ...openapi
        };
    }

    async use(...middlewares) {
        for (const middleware of middlewares) {
            await this.documentPaths(middleware);

            await super.use.apply(this, middlewares);
        }
    }

    static async validate(
        {params = Joi.any(), query = Joi.any(), body = Joi.any()} = {},
        obj
    ) {
        let values = {};
        for (const [property, schema] of Object.entries({params, query, body})) {
            values[property] = await JoiValidateAsync(obj[property], schema);
        }
        return values;
    }
}

function joiParameterToOpenApi({
    name,
    type,
    description,
    notes,
    children = {},
    ...param
}) {
    let obj = {
        name,
        description: description || notes,
        schema: {
            type,
            example: get(param, "examples.0.value"),
            default: get(param, "flags.default"),
            properties: Object.keys(children).reduce((obj, name) => {
                obj[name] = joiParameterToOpenApi(children[name]);
                return obj;
            }, {})
        },
        required: get(param, "flags.presence") === "required" ? true : false
    };
    return obj;
}

function joiParameterToOpenApiBody({
    name,
    type,
    description,
    notes,
    children = {},
    items,
    ...param
}) {
    return {
        name,
        type,
        description: description || notes,
        example: get(param, "examples.0.value"),
        properties: Object.keys(children).reduce((obj, name) => {
            obj[name] = joiParameterToOpenApiBody(children[name]);
            return obj;
        }, {}),
        items: Array.isArray(items) ? joiParameterToOpenApiBody(items[0]) : undefined,
        required: Object.keys(children).filter(name => {
            return get(children[name], "flags.presence") === "required"
                ? true
                : false;
        })
    };
}

function pathToId(path) {
    return path
        .replace(/\/?\{(.+?)\}/g, "") //.replace(/\{(.+?)\}/g, '$1')
        .replace(/\/(\w)/g, (all, m) => m.toUpperCase());
}
