const http2 = require("http2");
const {join} = require("path");
const fs = require("fs");
const zlib = require("zlib");

const test = require("ava");

const {Middleware} = require("../");
const {initServer} = require("./_utils.js");

const {
  HTTP2_HEADER_STATUS,
  HTTP2_HEADER_CONTENT_TYPE,
  HTTP2_HEADER_CONTENT_ENCODING
} = http2.constants;

initServer();

test("check gzip", async t => {
  t.plan(4);
  const staticR = new Middleware.Static({
    directory: join(__dirname, "./assets"),
    path: "/static",
  });
  await t.context.router.use(staticR);
  await t.context.server.use(new Middleware.Compress());

  const {headers, body} = await t.context.client.get("static/pride.txt", {
    headers: {
      "Accept-Encoding": "gzip"
    },
    responseType: "buffer"
  });
  t.is(headers[HTTP2_HEADER_STATUS], 200);
  t.is(headers[HTTP2_HEADER_CONTENT_TYPE], "text/plain");
  t.is(headers[HTTP2_HEADER_CONTENT_ENCODING], "gzip");
  t.deepEqual(zlib.gunzipSync(body), fs.readFileSync(join(__dirname, "./assets/pride.txt")));
});
