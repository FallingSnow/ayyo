const http2 = require("http2");

const test = require("ava");
const FormData = require("form-data");

const {Middleware} = require("../");
const {initServer} = require("./_utils.js");

const {
  HTTP2_HEADER_STATUS,
} = http2.constants;

initServer();

test("uploading formdata", async t => {
  t.plan(2);
  const route = new Middleware.Route({
    path: "form",
    method: "POST",
    handler: async ({req, res}) => {
      t.log("Route received body:", req.body);
      res.body = req.body;
    }
  });
  await t.context.router.use(route);
  const form = new FormData();
  form.append("person", "anonymous");
  t.log("FormData boundary:", form._boundary);

  const {headers, body} = await t.context.client.post("form", {
    body: form,
    responseType: "json"
  });
  t.is(headers[HTTP2_HEADER_STATUS], 200);
  t.deepEqual(body, {person: "anonymous"});
});


test.todo("uploading formdata files");
