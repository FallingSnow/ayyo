import util from "util";
import http2 from "http2";
import assert from "assert";

import jwt from "jsonwebtoken";

import {HTTPError} from "../error";
import {Middleware} from "./middleware";

const {HTTP2_HEADER_AUTHORIZATION} = http2.constants;
const jwtSignP = util.promisify(jwt.sign);

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
            typeof this.secret === "function" ? await this.secret : this.secret;

        let payload;
        try {
            payload = await util.promisify(jwt.verify)(
                token,
                secret,
                this.options.jwtOptions
            );
        } catch (error) {
            throw new HTTPError(
                401,
                await this.options.onFail(arguments[0], error),
                error
            );
        }
        req.jwt = payload;
    }
    static sign(payload, secret, options) {
        return jwtSignP(payload, secret, options);
    }
}
