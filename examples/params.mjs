import {Server, Middleware} from "../lib/index.mjs";


const server = new Server();
const router = new Middleware.Router();

async function main() {
  await router.use(
    new Middleware.Route({
      method: "GET",
      path: "/user/:department/:name",
      handler: async ({req, res}) => {
        res.body = JSON.stringify(req.params, null, 2);
      }
    })
  );
  await server.use(router);
  await server.listen(8080);
}

main().catch(console.error);
