import http2 from "http2";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { workerData, isMainThread, parentPort, threadId } from "worker_threads";

import codes from "http-status";
import throttle from "lodash.throttle";
import SharedMap from "sharedmap";
import maxmind from "maxmind";
import userAgent from "ua-parser-js";

import {Router, Route, Static, ServerSideEvents} from "../index.mjs";
import { set } from "../../util/get-set.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Stringify BigInt types
BigInt.prototype.toJSON = function BigIntToJson() { return this.toString(); };

const {
  // CACHE headers
  HTTP2_HEADER_STATUS,
  HTTP2_HEADER_USER_AGENT
} = http2.constants;

export class Metrics extends Router {
  constructor({
    ...rest
  } = {}) {
    super(rest);

    this.sse = new ServerSideEvents({
      method: "GET",
      path: "/events",
    });
    Object.assign(this, {
      metrics: {
        requests: {
          total: 0,
          latency: {
            100: -1,
            1000: -1,
            10000: -1,
            100000: -1,
            1000000: -1,
          },
          codes: Object.entries(codes).reduce((acc, [code]) => {
            if (!isNaN(code)) acc[code] = 0;
            return acc;
          }, {})
        }
      }
    });

    if (!isMainThread) {
      this.sharedmap = workerData.sharedmap;
      Object.setPrototypeOf(this.sharedmap, SharedMap.prototype);
      parentPort.on("message", this.handleMessage.bind(this));

      if (threadId === 2) {
        this.latency = Latency.ofSize(10000);
        parentPort.postMessage({type: "broadcast", action: "metrics.latencyArray", latencyArray: this.latency.buffer});
      }
    }

  }

  async init() {
    await super.init();
    this.asnLookup = await maxmind.open(resolve(__dirname, "databases/GeoLite2-ASN_20200707/GeoLite2-ASN.mmdb"));
    this.countryLookup = await maxmind.open(resolve(__dirname, "databases/GeoLite2-Country_20200707/GeoLite2-Country.mmdb"));
    this.cityLookup = await maxmind.open(resolve(__dirname, "databases/GeoLite2-City_20200707/GeoLite2-City.mmdb"));
    await super.use(
      new Route({
        path: "/report",
        method: "GET",
        handler: async ({res}) => {
          const report = process.report.getReport();
          res.body = report;
        }
      }),
      new Static({
        directory: resolve(__dirname, "./app/public"),
        path: "/ui"
      }),
      this.sse
    );

    // if (isMainThread || threadId === 1)
    //
  }

  render({res}) {
    res.stream.once("close", this.streamEnded.bind(this, ...arguments));
    return super.render(...arguments);
  }

  streamEnded({stream, req, res}) {
    // this.metrics.requests.total++;
    // this.metrics.requests.codes[res.headers[HTTP2_HEADER_STATUS]]++;
    const agent = userAgent(req.headers[HTTP2_HEADER_USER_AGENT]);

    this.sharedmap.lockWrite();

    // Browser name per OS
    if (agent?.os?.name && agent?.browser?.name) {
      const browserNamspace = `metrics.requests.os.${agent.os.name.toLowerCase()}.browser.${agent.browser.name.toLowerCase()}`;
      incrementSharedMap(this.sharedmap, browserNamspace, 1, false);
    }

    // Total # of requests
    const requestTotalNamspace = "metrics.requests.total";
    incrementSharedMap(this.sharedmap, requestTotalNamspace, 1, false);

    // Reeturned status code count
    const codeNamespace = `metrics.requests.codes.${res.headers[HTTP2_HEADER_STATUS]}`;
    incrementSharedMap(this.sharedmap, codeNamespace, 1, false);

    this.sharedmap.unlockWrite();

    stream.time = stream.endTime - stream.startTime;
    this.latency.push(stream.time);
    if (!isMainThread) {
      this.notifyOtherThreads();
    }
    this.broadcastSSE();
  }

  notifyOtherThreads = throttle(() => {
    parentPort.postMessage({type: "broadcast", action: "metrics.updated"});
  }, 2000, {leading: false})

  broadcastSSE = throttle(() => {
    if (Object.keys(this.sse.connections).length === 0)
      return;
    this.calculate()
      .then(JSON.stringify)
      .then((m) => this.sse.broadcast(m, "metrics"))
      // .then(() => this.broadcastTimer = setTimeout(this.broadcast.bind(this), REFRESH_TIME))
      .catch(console.error);
  }, 1000);

  async calculate() {
    // this.sharedmap.set("metrics.requests.latency.100", this.latency.average(100).toString());
    // this.sharedmap.set("metrics.requests.latency.1000", this.latency.average(1000).toString());
    // this.sharedmap.set("metrics.requests.latency.10000", this.latency.average(10000).toString());
    return (await sharedToJson(this.sharedmap)).metrics;
  }

  handleMessage(msg) {
    if (msg.action === "metrics.updated") {
      this.broadcastSSE();
    } else if (msg.action === "metrics.latencyArray") {
      this.latency = new Latency(msg.latencyArray);
    }
  }
}

class Latency extends BigUint64Array {
  constructor(shared) {
    super(shared, BigUint64Array.BYTES_PER_ELEMENT);
    this.location = new BigUint64Array(this.buffer, 0, 8);
  }
  static ofSize(size) {
    const shared = new SharedArrayBuffer(BigUint64Array.BYTES_PER_ELEMENT * (size + 1));
    return new Latency(shared);
  }
  push(time) {
    let location = Atomics.add(this.location, 0, 1n);
    if (location + 1n >= this.length) {
      location = Atomics.store(this.location, 0, 0n);
    }
    const finalValue = Atomics.store(this, Number(location), time);
    return finalValue;
  }
  average(latest = this.length) {
    if (this.length === 0) return -1n;

    const len = Math.min(latest - 1, this.length - 1);

    // const sum = this.reduce((a, b) a + b);
    let sum = 0n;
    const avg = sum / BigInt(len + 1);

    return avg;
  }
}

async function sharedToJson(map, prefix = "metrics") {
  return map.reduce((acc, value, key) => {
    if (key.startsWith(prefix))
      set(acc, key, value);
    return acc;
  }, {});
}

function incrementSharedMap(map, namespace, inc, lock = true) {
  if (lock) map.lockWrite();
  const value = map.get(namespace, {lockWrite: true}) || 0;
  map.set(namespace, parseInt(value) + inc, {lockWrite: true});
  if (lock) map.unlockWrite();
}
