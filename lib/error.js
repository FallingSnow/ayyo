import status from "http-status";

export class HTTPError extends Error {
    constructor(code = 500, message = status[code], data) {
        super(status[code]);
        this.message = message;
        this.statusCode = code;
        this.data = data;
    }
    set message(message) {
        this._message = message;
    }
    get message() {
        return this._message;
    }
}
