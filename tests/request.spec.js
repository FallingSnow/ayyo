const http2 = require("http2");

const test = require("ava");
const codes = require("http-status");

const {Middleware, HTTPError} = require("../");
const {initServer} = require("./_utils.js");

const {
  HTTP2_HEADER_STATUS,
} = http2.constants;

initServer();

test("params", async t => {
  t.plan(2);
  const route = new Middleware.Route({
    path: "/:first/:second/:third/params",
    method: "POST",
    handler: async ({req, res}) => {
      t.log("Route received params:", req.params);
      t.log("Route received query:", req.query);
      t.log("Route received body:", req.body);
      res.body = {...req.params, ...req.query, ...req.body};
    }
  });
  await t.context.router.use(route);

  const {headers, body} = await t.context.client.post("one/two/three/params?q1=one&q2=22&q3=richard%20harrow", {
    json: {
      j1: {
        nested: "object"
      },
      bool: true,
      num: 912353
    },
    responseType: "json"
  });
  t.is(headers[HTTP2_HEADER_STATUS], 200);
  t.deepEqual(body, {
    first: "one",
    second: "two",
    third: "three",
    q1: "one",
    q2: "22",
    q3: "richard harrow",
    j1: {
      nested: "object"
    },
    bool: true,
    num: 912353
  });
});

const excludedCodes = new Set([100, 101, 102, 103, 204, 205, 304]);
for (const [code, description] of Object.entries(codes)) {
  // Ignore testing specific codes in excludedCodes
  if (Number.isNaN(code) || excludedCodes.has(Number.parseInt(code, 10))) {
    continue;
  }

  test(`status code ${code}`, async t => {
    t.timeout(1000);
    t.plan(2);
    const route = new Middleware.Route({
      path: "/error/:code",
      handler: async ({req}) => {
        const error = new HTTPError(req.params.code);
        t.log("Error requested:", error);
        throw error;
      }
    });
    await t.context.router.use(route);

    t.log(`Calling error/${code}`);
    const {headers, body} = await t.context.client.get(`error/${code}`, {
      throwHttpErrors: false
    });
    t.log("Received:", {body, description, code});
    t.is(headers[HTTP2_HEADER_STATUS].toString(), code);
    t.is(body, description);
  });
}
