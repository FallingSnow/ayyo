import http2 from "http2";

import Joi from "joi";

import {HTTPError} from "../error";
import {deepmerge, get, set} from "../util";
import {Middleware, Router, Route} from ".";

const {HTTP2_HEADER_CONTENT_TYPE} = http2.constants;

export class OpenApi extends Router {
    constructor({
        serveApiPath = "/",
        serveRedocPath = "/docs",
        doc = {},
        ...rest
    } = {}) {
        super(rest);

        this.options = {
            serveRedocPath,
            serveApiPath
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

            // Intercept the original handler to add validation
            middleware.handler = async function handler({req, res}) {
                await OpenApi.validate(
                    get(data, "openapi.schema.consumes"),
                    req
                );
                const results = await originalHandler.apply(this, arguments);
                await OpenApi.validate(
                    get(data, "openapi.schema.produces"),
                    res
                );
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
        for (const [code, {description, contentType, body}] of Object.entries(
            producesParams
        )) {
            responses[code] = {
                description,
                content: {
                    [contentType]: {
                        schema: joiParameterToOpenApiBody(body.describe())
                    }
                }
            };
        }
        // console.debug(structure);
        // requestBody = {
        //     description: structure.description,
        //     required: get(structure, 'flags.presence') === 'required' ? true : false,
        //     content: consumes.reduce((obj, contentType) => {
        //         obj[contentType] = {
        //             schema: joiParameterToOpenApiBody(structure)
        //         }
        //         return obj;
        //     }, {})
        // };

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
        {path = Joi.any(), query = Joi.any(), body = Joi.any()} = {},
        obj
    ) {
        const errors = [
            {
                input: obj.params || null,
                schema: path
            },
            {
                input: obj.query || null,
                schema: query
            },
            {
                input: obj.body,
                schema: body
            }
        ].map(({input, schema}) => Joi.validate(input, schema).error);
        for (const error of errors) {
            if (error) throw new HTTPError(400, error.toString(), error);
        }
    }
}

function joiParameterToOpenApi({
    name,
    type,
    description,
    children = {},
    ...param
}) {
    let obj = {
        name,
        description,
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

function joiParameterToOpenApiBody({name, type, children = {}, ...param}) {
    return {
        name,
        type,
        example: get(param, "examples.0.value"),
        properties: Object.keys(children).reduce((obj, name) => {
            obj[name] = joiParameterToOpenApiBody(children[name]);
            return obj;
        }, {}),
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
