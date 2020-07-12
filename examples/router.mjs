import {Server, Middleware} from "../lib/index.mjs";


const server = new Server();
const router = new Middleware.Router();
const subrouter = new Middleware.Router({path: "/api"});

async function main() {
  await subrouter.use(
    new Middleware.Route({
      method: "GET",
      path: "/v1/hello",
      handler: async ({res}) => {
        res.body = "Hello World!";
      }
    })
  );
  await router.use(subrouter);
  await server.use(router);
  await server.listen(8080);
}

main().catch(console.error);
