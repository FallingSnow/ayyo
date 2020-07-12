import {Server, Middleware} from "../lib/index.mjs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const server = new Server();
const router = new Middleware.Router();

async function main() {
  await router.use(
    new Middleware.Static({
      directory: resolve(__dirname, "../tests/assets"),
      path: "/static"
    })
  );
  await server.use(router);
  await server.listen(8080);
}

main().catch(console.error);
