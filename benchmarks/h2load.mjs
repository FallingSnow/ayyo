import {spawn} from "child_process";

async function main() {
  const server = spawn("node", ["examples/simple.js"]);
  server.stdout.on("data", chunk => process.stdout.write("SERVER: " + chunk.toString()));
  server.stderr.on("data", chunk => process.stderr.write("SERVER: " + chunk.toString()));
  server.on("close", () => {
    console.info("SERVER:", "Stopped");
  });

  await sleep(2000);

  const load = spawn("h2load", [
    "-n1000000",
    "-c1000",
    "-m10",
    "https://localhost:8080"
  ]);
  load.stdout.on("data", chunk => process.stdout.write("H2LOAD: " + chunk.toString()));
  load.stderr.on("data", chunk => process.stderr.write("H2LOAD: " + chunk.toString()));
  load.on("close", () => {
    console.info("H2LOAD:", "Stopped");
    server.kill();
  });
}

// eslint-disable-next-line no-console
main().catch(console.error);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
