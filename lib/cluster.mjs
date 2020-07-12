import { Server, createConnection } from "net";
import os from "os";
import { workerData, isMainThread, Worker } from "worker_threads";

import tmp from "tmp";
import SharedMap from "sharedmap";
import load from "load-balancers";

export class Cluster {
  constructor({file, server, numServers: numThreads = os.cpus().length - 1} = {}) {

    if (!isMainThread) {
      return server(workerData);
    }

    this.file = file;
    this.listeningCount = 0;
    this.numThreads = numThreads;
    this.balancer = new load.P2cBalancer(numThreads);
    this.server = new Server();
    this.ready = new Promise(rdy => this._ready = rdy);

    this.server.on("connection", this.handleConnection.bind(this));

    this.sharedmap = new SharedMap(128 * 1024, 64, 16);

    this.servers = {};
    for (let i = 0; i < numThreads; i++) {
      this.startWorker();
    }
  }

  startWorker() {
    const address = process.platform === "linux" ? [tmp.tmpNameSync()] : [0, "127.0.0.1"];
    const worker = new Worker(this.file, {
      workerData: {
        address,
        sharedmap: this.sharedmap,
        numThreads: this.numThreads
      },
    });
    this.servers[worker.threadId] = worker;
    worker.on("message", msg => {
      if (msg.type !== "response")
        msg.ownerThreadId = worker.threadId;
      if (msg.type === "listening") {
        if (++this.listeningCount === this.numThreads) this._ready();
        if (msg.address) {
          worker.address = msg.address;
        } else {
          worker.address = `${msg.address}:${msg.port}`;
        }
      } else if (msg.type === "response") {
        this.servers[msg.ownerThreadId].postMessage(msg);
      } else if (msg.type === "broadcast") {
        if (msg.receivingThreadId)
          this.servers[msg.receivingThreadId].postMessage(msg);
        else
          for (const server of Object.values(this.servers)) {
            server.postMessage(msg);
          }
      }
      // console.debug("Message received from worker:", msg);
    });
    worker.on("exit", code => {
      delete this.servers[worker.threadId];

      // Worker died unexpectedly
      if (code > 1)
        this.startWorker();
    });
  }

  async listen(...args) {
    if (!isMainThread) return;
    await this.ready;
    await this.server.listen(...args);
  }

  async close(...args) {
    for (const server of this.servers) {
      await server.close(...args);
    }
  }

  async handleConnection(inbound) {
    const target = Object.values(this.servers)[this.balancer.pick()].address;
    const outbound = createConnection(target);
    inbound.pipe(outbound);
    outbound.pipe(inbound);

    outbound.on("end", inbound.end);
    inbound.on("end", outbound.end);

    outbound.on("error", inbound.destroy);
    inbound.on("error", inbound.destroy);
  }
}
