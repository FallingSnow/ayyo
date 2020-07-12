import http2 from "http2";

import {
  Route
} from "./router.mjs";

const {
  HTTP2_HEADER_STATUS,
  HTTP2_HEADER_CONTENT_TYPE,
} = http2.constants;

export class ServerSideEvents extends Route {
  constructor({
    keepAliveInterval = 45000,
    ...rest
  }) {
    super(rest);
    this.connections = {};
    this.options = {
      keepAliveInterval
    };
  }

  async onConnection(_client) {

  }

  async onClose(_client) {

  }

  render({
    stream,
    req,
    res
  }) {
    res.headers[HTTP2_HEADER_CONTENT_TYPE] = "text/event-stream";
    // Set default status code to 200 (we are inside a route so we know it's been found)
    res.headers[HTTP2_HEADER_STATUS] = 200;
    // You must send headers to write to stream without closing
    stream.respond(res.headers);

    const promise = new Promise(async (resolve, reject) => {
      try {
        const client = new ServerSideEventsClient({req, stream, res, resolve, reject, options: this.options});
        this.connections[client.stream.id] = client;
        // Remove connection when it is closed
        client.stream.once("close", async () => {
          delete this.connections[client.stream.id];
          try {
            await this.onClose({stream, req, res, client});
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(error);
          }
        });
        await this.onConnection({stream, req, res, client});
      } catch (error) {
        return reject(error);
      }
    });

    return promise;
  }

  async broadcast(...args) {
    return await Promise.all(Object.values(this.connections).map(p => p.send(...args)));
  }
}

class ServerSideEventsClient {
  constructor({resolve: _resolve, reject: _reject, ...rest}) {
    Object.assign(this, rest, {_resolve, _reject});
    this.stream.once("close", () => {
      clearInterval(this.keepAliveTimer);
      this.onClose(this);
    });

    // Node has a default timeout of 120 seconds, so we refresh every n seconds
    this.keepAliveTimer = setInterval(() => {
      this.stream.write(":keep-alive\n");
    }, this.options.keepAliveInterval);
  }
  async onClose() {

  }
  async send(message, event, id) {
    if (id)
      this.stream.write(`id: ${id}\n`);
    if (event)
      this.stream.write(`event: ${event}\n`);
    this.stream.write(`data: ${message}\n\n`);
  }
  async close(msg) {
    if (msg instanceof Error) {
      return this._reject(msg);
    }
    this._resolve(msg);
  }
}
