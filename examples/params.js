const {Server, Middleware} = require("../");

const server = new Server({
  certPath: "/etc/ssl/certs/localhost.pem",
  privKeyPath: "/etc/ssl/private/localhost.pem"
});
const router = new Middleware.Router();

(async () => {
  try {
    await router.use(
      new Middleware.Route({
        method: "GET",
        path: "/user/{department}/{name}",
        handler: async ({req, res}) => {
          res.body = JSON.stringify(req.params, null, 2);
        }
      })
    );
    await server.use(router);
    await server.listen(8080);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
  }
})();
