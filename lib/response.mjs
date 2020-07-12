import http2 from "http2";
import fs from "fs";
import { createRequire } from 'module';

import cook from "simple-cookie";

const require = createRequire(import.meta.url);
const {name, version} = require("../package.json");
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
  set file(path) {
    this._file = path;
    this.body = fs.createReadStream(path);
  }
  get file() {
    return this._file;
  }
}
