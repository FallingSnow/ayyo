import http2 from "http2";
import querystring from "querystring";

import {collectStream} from "./util";
import {parse as formDataParse} from "./formdata-parser";
import {HTTPError} from "./error";

const {HTTP2_HEADER_PATH, HTTP2_HEADER_CONTENT_TYPE} = http2.constants;

export default class Request {
    constructor(headers, flags) {
        this.headers = headers;
        this.flags = flags;
        const parsedUrl = new URL(headers[HTTP2_HEADER_PATH]);
        this.url = parsedUrl;
        this.query = querystring.parse(parsedUrl.search);
        this.cookie = parseCookies(headers["cookie"]);
    }
    async parseBody(stream) {
        if (stream)
            this.body = await parser(
                this.headers[HTTP2_HEADER_CONTENT_TYPE] || "",
                isStream(stream) ? await collectStream(stream) : stream
            );
    }
}
Request.fromHTTP1 = function fromHTTP1(req) {
    return new Request({...req.headers, [HTTP2_HEADER_PATH]: req.url});
};

// RFC 6265 compliant cookie parsing
export function parseCookies(cookies = "") {
    return cookies.split("; ").reduce((obj, keyVal) => {
        const [key, val] = keyVal.split(/=(.+)/);
        obj[key] = val;
        return obj;
    }, {});
}

export async function parser(mime, data) {
    try {
        if (mime.startsWith("application/json"))
            return JSON.parse(data.toString());
        if (mime.startsWith("multipart/form-data")) {
            const boundary = mime.substring(mime.indexOf("boundary=") + 9);
            return formDataParse(boundary, data);
        }
    } catch (e) {
        throw new HTTPError(500, "Unable to parse body", e);
    }

    return data.toString();
}

function isStream(stream) {
    return (
        stream !== null &&
        typeof stream === "object" &&
        typeof stream.pipe === "function"
    );
}
