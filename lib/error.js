import status from 'http-status';

export class HTTPError extends Error {
    constructor(code = 500, message = status[code], data) {
        super(message);
        this.statusCode = code;
        this.data = data;
    }
}
