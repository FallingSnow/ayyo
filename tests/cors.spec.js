const http2 = require("http2");

const test = require("ava");

const {Middleware} = require("../");
const {initServer} = require("./_utils.js");

const {
  HTTP2_HEADER_STATUS,
} = http2.constants;

initServer();

test.todo("origin");
test.todo("headers");
test.todo("methods");
test.todo("maxage & credentials");
