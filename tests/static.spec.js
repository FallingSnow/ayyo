const http2 = require("http2");
const fs = require("fs");
const {join} = require("path");

const test = require("ava");

const {Middleware} = require("../");
const {initServer} = require("./_utils.js");

const {
  HTTP2_HEADER_STATUS,
  HTTP2_HEADER_CONTENT_TYPE,
  HTTP2_HEADER_CONTENT_ENCODING
} = http2.constants;

initServer();

test("static route", async t => {
  t.plan(4);
  const staticR = new Middleware.Static({
    directory: join(__dirname, "./assets"),
    path: "/static"
  });
  await t.context.router.use(staticR);

  const {headers, body} = await t.context.client.get("static/fireball.png", {
    responseType: "buffer"
  });
  t.is(headers[HTTP2_HEADER_STATUS], 200);
  t.is(headers[HTTP2_HEADER_CONTENT_TYPE], "image/png");
  t.is(headers[HTTP2_HEADER_CONTENT_ENCODING], undefined);
  t.deepEqual(body, fs.readFileSync(join(__dirname, "./assets/fireball.png")));
});

test("static should 404", async t => {
  t.plan(1);
  const staticR = new Middleware.Static({
    directory: join(__dirname, "./assets"),
    path: "/static"
  });
  await t.context.router.use(staticR);

  const {headers} = await t.context.client.get("static/fireball.pngg");
  t.is(headers[HTTP2_HEADER_STATUS], 404);
});

test("static route within nested router", async t => {
  t.plan(4);
  const subrouter = new Middleware.Router({
    path: "/router"
  });
  const staticR = new Middleware.Static({
    directory: join(__dirname, "./assets"),
    path: "/static"
  });
  await subrouter.use(staticR);
  await t.context.router.use(subrouter);

  const {headers, body} = await t.context.client.get("router/static/flower.png", {
    responseType: "buffer"
  });
  t.is(headers[HTTP2_HEADER_STATUS], 200);
  t.is(headers[HTTP2_HEADER_CONTENT_TYPE], "image/png");
  t.is(headers[HTTP2_HEADER_CONTENT_ENCODING], undefined);
  t.deepEqual(body, fs.readFileSync(join(__dirname, "./assets/flower.png")));
});

test("static default return", async t => {
  t.plan(4);
  const staticR = new Middleware.Static({
    directory: join(__dirname, "./assets"),
    path: "/static",
    baseFilePath: "pride.txt"
  });
  await t.context.router.use(staticR);

  const {headers, body} = await t.context.client.get("static", {
    responseType: "buffer"
  });
  t.is(headers[HTTP2_HEADER_STATUS], 200);
  t.is(headers[HTTP2_HEADER_CONTENT_TYPE], "text/plain");
  t.is(headers[HTTP2_HEADER_CONTENT_ENCODING], undefined);
  t.deepEqual(body, fs.readFileSync(join(__dirname, "./assets/pride.txt")));
});

test("static fallback", async t => {
  t.plan(8);
  const staticR = new Middleware.Static({
    directory: join(__dirname, "./assets"),
    path: "/static",
    fallbackPath: "pride.txt"
  });
  await t.context.router.use(staticR);

  const {headers, body} = await t.context.client.get("static/unknown", {
    responseType: "buffer"
  });
  t.is(headers[HTTP2_HEADER_STATUS], 200);
  t.is(headers[HTTP2_HEADER_CONTENT_TYPE], "text/plain");
  t.is(headers[HTTP2_HEADER_CONTENT_ENCODING], undefined);
  t.deepEqual(body, fs.readFileSync(join(__dirname, "./assets/pride.txt")));

  // Normal requests should not fallback
  const {headers: imgHeaders, body: imgBody} = await t.context.client.get("static/fireball.png", {
    responseType: "buffer"
  });
  t.is(imgHeaders[HTTP2_HEADER_STATUS], 200);
  t.is(imgHeaders[HTTP2_HEADER_CONTENT_TYPE], "image/png");
  t.is(imgHeaders[HTTP2_HEADER_CONTENT_ENCODING], undefined);
  t.deepEqual(imgBody, fs.readFileSync(join(__dirname, "./assets/fireball.png")));
});

test("static nested folders", async t => {
  t.plan(8);
  const staticR = new Middleware.Static({
    directory: join(__dirname, "./assets"),
    path: "/static",
  });
  await t.context.router.use(staticR);

  const {headers, body} = await t.context.client.get("static/nested/folder/hello.txt");
  t.is(headers[HTTP2_HEADER_STATUS], 200);
  t.is(headers[HTTP2_HEADER_CONTENT_TYPE], "text/plain");
  t.is(headers[HTTP2_HEADER_CONTENT_ENCODING], undefined);
  t.is(body, "Hello World.txt\n");

  // Normal requests should not fallback
  const {headers: imgHeaders, body: imgBody} = await t.context.client.get("static/fireball.png", {
    responseType: "buffer"
  });
  t.is(imgHeaders[HTTP2_HEADER_STATUS], 200);
  t.is(imgHeaders[HTTP2_HEADER_CONTENT_TYPE], "image/png");
  t.is(imgHeaders[HTTP2_HEADER_CONTENT_ENCODING], undefined);
  t.deepEqual(imgBody, fs.readFileSync(join(__dirname, "./assets/fireball.png")));
});

test("static nested should 404", async t => {
  t.plan(1);
  const staticR = new Middleware.Static({
    directory: join(__dirname, "./assets"),
    path: "/static"
  });
  await t.context.router.use(staticR);

  const {headers} = await t.context.client.get("static/nested/folder/unknown.txt");
  t.is(headers[HTTP2_HEADER_STATUS], 404);
});
