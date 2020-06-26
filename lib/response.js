import http2 from "http2";

import cook from "simple-cookie";

import {name, version} from "../package.json";
import {collectStream} from "./util";
import {parse as formDataParse} from "./formdata-parser";
import {HTTPError} from "./error";

const {HTTP2_HEADER_STATUS, HTTP2_HEADER_SET_COOKIE, HTTP2_HEADER_SERVER} = http2.constants;

export default class Response {
  constructor(stream) {
    this.stream = stream;
    this.write = stream.write.bind(stream);
    this.headers = {
      [HTTP2_HEADER_STATUS]: 404,
      [HTTP2_HEADER_SERVER]: `${name} ${version}`
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
  get trailers() {
    return this.finalHeaders();
  }
}
