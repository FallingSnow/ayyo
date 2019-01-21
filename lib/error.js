import status from "http-status";

export class HTTPError extends Error {
    constructor(code = 500, message = status[code], data) {
        super(status[code]);
        this.message = message;
        this.code = code;
        this.data = data;
    }
    sanitize() {
        return {message: this.message, code: this.code};
    }
}
