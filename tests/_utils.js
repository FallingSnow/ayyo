const got = require("got");
const test = require("ava");

const {Server, Middleware} = require("../");

module.exports = {};

module.exports.initServer = function initServer() {
  test.beforeEach(async t => {
    const server = new Server();

    const router = new Middleware.Router();
    await server.use(router);

    await server.listen(0);
    const {port} = server.listener.address();

    server.onError = ({req, error}) => t.log(req ? req.url.href : "Unknown path", error);

    const client = got.extend({
      retry: 0,
      throwHttpErrors: false,
      prefixUrl: `https://localhost:${port}`,
      http2: true, https: {rejectUnauthorized: false}
    });

    t.context = {
      router,
      server,
      port,
      client
    };
  });
  test.afterEach(async t => {
    await t.context.server.close();
  });
};
