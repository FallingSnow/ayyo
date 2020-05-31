const {Server, Middleware} = require("../../");

const server = new Server();
const router = new Middleware.Router();

(async () => {
  try {
    await router.use(
      new Middleware.Static({
        directory: __dirname,
        path: "/static"
      })
    );
    await server.use(router);
    await server.listen(8080);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
  }
})();
