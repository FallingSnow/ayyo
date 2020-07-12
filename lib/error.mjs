import status from "http-status";

const excludedMessageCodes = new Set([100, 101, 204, 205, 304]);
export class HTTPError extends Error {
  constructor(code = 500, message = !excludedMessageCodes.has(code) ? status[code] : "", data) {
    super(status[code]);
    this.message = message;
    this.code = code;
    this.data = data;
  }
  sanitize() {
    return {message: this.message, code: this.code};
  }
}
