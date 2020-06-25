const {Server, Middleware} = require("../../");

const server = new Server();
const router = new Middleware.Router();
const cache = new Middleware.Cache({weak: false});

(async () => {
  try {
    await router.use(
      new Middleware.Static({
        directory: __dirname,
        path: "/static"
      })
    );
    await server.use(router);
    await server.use(cache);
    await server.listen(8080);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
  }
})();
