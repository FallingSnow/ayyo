import http2 from "http2";

import cook from "simple-cookie";

import {collectStream} from "./util";
import {parse as formDataParse} from "./formdata-parser";
import {HTTPError} from "./error";

const {HTTP2_HEADER_STATUS, HTTP2_HEADER_SET_COOKIE} = http2.constants;

export default class Response {
  constructor(stream) {
    this.stream = stream;
    this.write = stream.write.bind(stream);
    this.headers = {
      [HTTP2_HEADER_STATUS]: 404
    };
    this.cookie = new Proxy({}, {
      set: (obj, name, params) => {
        const cookie = cook.stringify({
          name,
          ...params
        });
        return obj[name] = cookie;
      }
    });
  }
  finalHeaders() {
    const setCookieHeaders = Object.values(this.cookie);
    return {...this.headers, [HTTP2_HEADER_SET_COOKIE]: setCookieHeaders};
  }
}
