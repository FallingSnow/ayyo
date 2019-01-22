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
            tokenName,
            onFail,
            jwtOptions
        };
    }

    async render({req}) {
        if ((await super.render.apply(this, arguments)) === Middleware.DONE) return Middleware.DONE;

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
    }
}

JsonWebToken.sign = jwtSignP;
JsonWebToken.verify = jwtVerifyP;
