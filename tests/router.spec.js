const http2 = require("http2");

const test = require("ava");

const {Middleware} = require("../");
const {initServer} = require("./_utils.js");

const {
  HTTP2_HEADER_STATUS,
} = http2.constants;

initServer();

test("nested routers with param", async t => {
  const subrouter = new Middleware.Router({path: "/api"});
  t.plan(2);
  await subrouter.use(
    new Middleware.Route({
      method: "GET",
      path: "/v1/hello/:name",
      handler: async ({req, res}) => {
        res.body = `Hello ${req.params.name}!`;
      }
    })
  );
  await t.context.router.use(subrouter);

  const {headers, body} = await t.context.client.get("api/v1/hello/favio");
  t.is(headers[HTTP2_HEADER_STATUS], 200);
  t.is(body, "Hello favio!");
});
test("route get", async t => {
  t.plan(2);
  await t.context.router.use(
    new Middleware.Route({
      method: "GET",
      handler: async ({res}) => {
        res.body = "Hello World!";
      }
    })
  );

  const {headers, body} = await t.context.client.get("");
  t.is(headers[HTTP2_HEADER_STATUS], 200);
  t.is(body, "Hello World!");
});
test("route post", async t => {
  t.plan(2);
  await t.context.router.use(
    new Middleware.Route({
      method: "POST",
      handler: async ({req, res}) => {
        res.body = req.body;
      }
    })
  );

  const json = {
    hello: {
      world: true
    }
  };
  const {headers, body} = await t.context.client.post("", {
    json,
    responseType: "json"
  });
  t.is(headers[HTTP2_HEADER_STATUS], 200);
  t.deepEqual(body, json);
});
