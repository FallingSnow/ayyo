import util from 'util';
import http2 from 'http2';
import assert from 'assert';

import jwt from 'jsonwebtoken';

import {
    HTTPError
} from '../error';
import {
    Middleware
} from './middleware';

const {
    HTTP2_HEADER_AUTHORIZATION
} = http2.constants;

export class JsonWebToken extends Middleware {

    constructor({
        secret,
        jwtOptions,
        tokenName = 'token'
    } = {}) {
        super();

        // Verify existence of a valid secret
        assert(typeof secret === 'string' && secret, "You must defined a valid secret");

        // Store secret
        this.secret = secret;
        this.options = {
            tokenName,
            jwtOptions
        };
    }

    async render({
        req
    }) {
        // Token is split in case of a prefix, such as "Bearer"
        const token = (() => {
            let tokenSegments = (req.headers[HTTP2_HEADER_AUTHORIZATION] || req.cookie[this.options.tokenName] || req.query['this.options.tokenName'] || '').split(' ');
            return tokenSegments[1] || tokenSegments[0];
        })();

        let decoded;
        try {
            decoded = await util.promisify(jwt.verify)(token, this.secret, this.options.jwtOptions);
        } catch (error) {
            throw new HTTPError(401, undefined, error);
        }
        req.token = decoded;
    }
    static sign(payload, secret, options) {
        return util.promisify(jwt.sign)(payload, secret, options);
    }
}
