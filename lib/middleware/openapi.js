import http2 from "http2";
import {promisify} from "util";
import assert from "assert";
import querystring from "querystring";

import Joi from "@hapi/joi";
import httpStatuses from "http-status";
import prettier from "prettier";

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
        await super.init();
        if (this.options.serveRedocPath)
            await super.use(
                new Route({
                    path: this.options.serveRedocPath,
                    method: "GET",
                    handler: ({res}) => {
                        res.headers[HTTP2_HEADER_CONTENT_TYPE] =
                            "text/html; charset=utf-8";
                        res.body = `<link href="https://fonts.googleapis.com/css?family=Montserrat" rel="stylesheet"><style>html,body{margin:0;padding:0;}</style><redoc spec-url='.${
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
            const documentedRoute = this.routeToOpenapi(
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
                            req,
                            {noStrip: true}
                        );
                        Object.assign(req, validatedValue);
                    } catch (error) {
                        throw new HTTPError(400, error.toString(), error);
                    }

                const results = await originalHandler.apply(this, arguments);

                // Validate response against schema
                if (options.validate.responses)
                    try {
                        const responseStatusCode = res.headers[HTTP2_HEADER_STATUS];
                        const responseSchema = get(
                            data,
                            `openapi.schema.produces.${
                                responseStatusCode
                            }`
                        );
                        if (!responseSchema)
                            throw new Error(`Server tried to return an undocumented status code ${responseStatusCode}`);
                        const validatedValue = await OpenApi.validate(
                            responseSchema,
                            res
                        );
                        Object.assign(res, validatedValue);
                    } catch (error) {
                        throw new HTTPError(500, "Invalid Server Response", error);
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

    routeToOpenapi({method, path, data: {openapi = {}}}, realPath) {
        const {operationId = pathToId(path, method), schema = {}, ...passthrough} =
            openapi;

        let parameters = [],
            requestBody,
            responses = {};

        // Convert & add path parameters to OpenAPI specification
        const pathParams = get(schema, "consumes.path");
        if (pathParams) {
            assert(
                pathParams.describe,
                `Path validation for "${realPath}/${method}" is not a valid joi object`
            );
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
            assert(
                queryParams.describe,
                `Query validation for "${realPath}/${method}" is not a valid joi object`
            );
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
            assert(
                bodyParams.describe,
                `Body validation for "${realPath}/${method}" is not a valid joi object`
            );
            const structure = bodyParams.describe();
            // console.debug(structure);
            requestBody = {
                summary: structure.summary,
                description: structure.description,
                required:
                    get(structure, "flags.presence") === "required"
                        ? true
                        : false,
                content: consumes.reduce((obj, contentType) => {
                    obj[contentType] = {
                        schema: this.joiParameterToOpenApiBody(structure)
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
                        schema: this.joiParameterToOpenApiBody(body.describe())
                    }
                };
        }

        const xCodeSamples = genCodeSamples.apply(this, [...arguments, schema]);

        return {
            operationId,
            parameters,
            responses,
            requestBody,
            "x-code-samples": xCodeSamples,
            ...passthrough
        };
    }

    joiParameterToOpenApiBody({
        name,
        label,
        type,
        summary,
        description,
        notes,
        valids,
        children = {},
        items,
        alternatives = [],
        base,
        ...param
    }) {
        if (type === "alternatives") {
            if (base) {
                type = base.type;
                children = base.children;
            } else {
                const firstAlt = alternatives[0];
                type = firstAlt.type || firstAlt.peek.type;
            }
        }
        const properties = Object.keys(children).filter(name => {
            const child = children[name];
            return get(child, "flags.presence") !== "forbidden" && !get(child, "flags.strip");
        }).reduce((obj, name) => {
            obj[name] = this.joiParameterToOpenApiBody(children[name]);
            return obj;
        }, {});


        // console.log(alternatives)
        let discriminator = alternatives.reduce((obj, {peek, then}) => {
            if (!peek || !then)
                return obj;

            const oneOfSchema = this.joiParameterToOpenApiBody(then);
            set(this.doc, `components.${name}.${oneOfSchema.name}`, oneOfSchema);
            if (typeof obj !== "object") obj = {propertyName: Object.keys(get(peek, "children"))[0], mapping: {[oneOfSchema.name]: `#/components/${name}/${oneOfSchema.name}`}};
            else obj.mapping[oneOfSchema.name] = `#/components/${name}/${oneOfSchema.name}`;

            return obj;
        }, undefined);

        return {
            name: name || label,
            type,
            enum: valids,
            summary: summary || description,
            description: notes,
            example: get(param, "examples.0.value"),
            default: get(param, "flags.default"),
            properties,
            discriminator,
            items: Array.isArray(items)
                ? this.joiParameterToOpenApiBody(items[0])
                : undefined,
            required: Object.keys(children).filter(name => {
                return get(children[name], "flags.presence") === "required"
                    ? true
                    : false;
            })
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
        obj,
        options
    ) {
        let values = {};
        for (const [property, schema] of Object.entries({
            params,
            query,
            body
        })) {
            // console.debug(property, obj[property], schema.describe())
            values[property] = await JoiValidateAsync(obj[property], schema, options);
        }
        return values;
    }
}

function joiParameterToOpenApi({
    name,
    type,
    valids,
    summary,
    description,
    notes,
    children = {},
    ...param
}) {
    if (get(param, "flags.presence") === "forbidden" || get(param, "flags.strip")) return undefined;
    let obj = {
        name,
        enum: valids,
        summary: summary || description,
        description: notes,
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

function structureToObject({type, children, examples}) {
    if (children) {
        let obj = {};
        for (const [name, child] of Object.entries(children)) {
            obj[name] = structureToObject(child);
        }
        return obj;
    } else if (examples && examples.length > 0) {
        return examples[0].value;
    } else {
        return type;
    }
}

function genCodeSamples({method}, realPath, schema) {
    const contentTypes = get(schema, "consumes.contentTypes") || [];
    const body = get(schema, "consumes.body")
        ? structureToObject(get(schema, "consumes.body").describe())
        : undefined;
    const pathParams = get(schema, "consumes.path")
        ? structureToObject(get(schema, "consumes.path").describe())
        : undefined;
    const query = get(schema, "consumes.query")
        ? "?" +
          querystring.stringify(
              structureToObject(get(schema, "consumes.query").describe())
          )
        : "";

    const pathWithPathParams = realPath.replace(/\{(.+?)\}/g, (match, paramName) => pathParams[paramName]);
    const path = `${pathWithPathParams}${query}`;
    const samples = [];
    if (~contentTypes.indexOf("multipart/form-data")) {
        samples.push({
            lang: "JavaScript",
            label: "JavaScript (Formdata)",
            source: (() => {
                let preamble = "";
                if (body) {
                    preamble = "let formData = new FormData();\n";
                    for (const [key, value] of Object.entries(body)) {
                        preamble += `formData.append("${key}", ${JSON.stringify(
                            value
                        )});\n`;
                    }
                }
                const options = {
                    method,
                    body: body ? "formData" : undefined
                };
                return prettier.format(
                    `${preamble}fetch("${path}", ${JSON.stringify(
                        options
                    ).replace("\"formData\"", "formData")})`,
                    {parser: "babel"}
                );
            })()
        });
        samples.push({
            lang: "Shell",
            label: "Curl (Formdata)",
            source: (() => {
                let preamble = `curl -X ${method.toUpperCase()}`;
                if (body) {
                    for (const [key, value] of Object.entries(body)) {
                        preamble += ` -F ${key}="${value}"`;
                    }
                }
                const suffix = `${path}`;
                return `${preamble} ${suffix}`;
            })()
        });
    }

    if (~contentTypes.indexOf("application/json")) {
        samples.push({
            lang: "JavaScript",
            label: "JavaScript (JSON)",
            source: (() => {
                const options = {
                    method,
                    body: body
                };
                return prettier.format(
                    `fetch("${path}", ${JSON.stringify(options)})`,
                    {parser: "babel"}
                );
            })()
        });
        samples.push({
            lang: "Shell",
            label: "Curl (JSON)",
            source: (() => {
                let preamble = `curl -X ${method.toUpperCase()} -H 'Content-Type: application/json'`;
                if (body) {
                    preamble += ` -d ${JSON.stringify(body)}`;
                }
                const suffix = `${path}`;
                return `${preamble} ${suffix}`;
            })()
        });
    }
    return samples;
}

function pathToId(path, method) {
    return path
        .replace(/\/?\{(.+?)\}/g, "") //.replace(/\{(.+?)\}/g, '$1')
        .replace(/\/(\w)/g, (all, m) => m.toUpperCase()) + method.toUpperCase();
}
