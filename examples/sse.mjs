import http2 from "http2";
const {HTTP2_HEADER_CONTENT_TYPE} = http2.constants;

import {Server, Middleware} from "../lib/index.mjs";


const server = new Server();
const router = new Middleware.Router();

const listeningPage = `
<html>
<script>
var evtSource = new EventSource('/sse');
evtSource.onmessage = function(e) {
  console.log(e);
}
</script>
<h1>Check developer tools network tab!</h1>
</html>
`;

async function main() {
  const sse = new Middleware.ServerSideEvents({
    method: "GET",
    path: "/sse",
  });
  sse.onConnection = async ({client}) => {
    console.debug("New SSE connection");
    await client.send((new Date()).toString(), "ping");
  };

  sse.onClose = async ({client: _client}) => {
    console.debug("Lost SSE connection");
  };

  await router.use(
    new Middleware.Route({
      method: "GET",
      path: "",
      handler: async ({res}) => {
        res.headers[HTTP2_HEADER_CONTENT_TYPE] = "text/html";
        res.body = listeningPage;
      }
    }),
    sse
  );
  await server.use(router);
  await server.listen(8080);
}

main().catch(console.error);
