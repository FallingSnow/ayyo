import util from "util";
import http2 from "http2";
import assert from "assert";

import jwt from "jsonwebtoken";

import {HTTPError} from "../error";
import {Middleware} from "./middleware";

const {HTTP2_HEADER_AUTHORIZATION} = http2.constants;
const jwtSignP = util.promisify(jwt.sign);
const jwtVerifyP = util.promisify(jwt.verify);

export class JsonWebToken extends Middleware {
    constructor({
        secret,
        jwtOptions,
        permissions = [],
        onFail = () => {},
        tokenName = "token"
    } = {}) {
        super();

        // Verify existence of a valid secret
        assert(
            typeof secret !== "undefined",
            "You must defined a valid secret"
        );

        // Store secret
        this.secret = secret;
        this.options = {
            permissions,
            tokenName,
            onFail,
            jwtOptions
        };
    }

    async render({req}) {
        // Token is split in case of a prefix, such as "Bearer"
        const token = (() => {
            let tokenSegments = (
                req.headers[HTTP2_HEADER_AUTHORIZATION] ||
                req.cookie[this.options.tokenName] ||
                req.query[this.options.tokenName] ||
                ""
            ).split(" ");
            return tokenSegments[1] || tokenSegments[0];
        })();

        const secret =
            typeof this.secret === "function"
                ? await this.secret(req)
                : this.secret;

        try {
            const payload = await JsonWebToken.verify(
                token,
                secret,
                this.options.jwtOptions
            );
            req.jwt = payload;
        } catch (error) {
            throw new HTTPError(
                401,
                await this.options.onFail(arguments[0], error),
                error
            );
        }
        for (const permission of this.options.permissions) {
            // console.debug(req.jwt.permissions, permission, get(req.jwt.permissions, permission));
            if (!get(req.jwt.permissions, permission)) {
                throw new HTTPError(
                    403,
                    await this.options.onFail(arguments[0])
                );
            }
        }
    }
}

JsonWebToken.sign = jwtSignP;
JsonWebToken.verify = jwtVerifyP;

function get(object, path, delimiter = ".", any = "*", anyany = "**") {
    return (Array.isArray(path) ? path : path.split(delimiter)).reduce(
        (k, v) => (k ? k[v] || k[any] || (k[anyany] ? k : undefined) : undefined),
        object
    );
}
