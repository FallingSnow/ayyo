import {Server, Middleware, Cluster} from "../lib/index.mjs";
import { fileURLToPath } from "url";

async function server({address}) {
  const server = new Server();
  const router = new Middleware.Router();

  await router.use(
    new Middleware.Route({
      method: "GET",
      path: "",
      handler: async ({res}) => {
        res.body = "Hello World!";
      }
    })
  );
  await server.use(router);
  await server.listen(...address);

  return server;
}

async function main() {
  // Can return either a Server or a Cluster
  const cluster = new Cluster({
    file: fileURLToPath(import.meta.url),
    server
  });

  if (!(cluster instanceof Cluster))
    return;

  await cluster.listen(8080);
}

// eslint-disable-next-line no-console
main().catch(console.error);
