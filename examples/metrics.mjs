import {Server, Middleware} from "../lib/index.mjs";

const server = new Server();
const metrics = new Middleware.Metrics({
  path: "/metrics"
});

async function main() {
  await server.use(metrics);
  await server.listen(8080);
}

main().catch(console.error);
