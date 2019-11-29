export function collectStream(stream) {
  let buffers = [];
  return new Promise((res, rej) => {
    stream
      .on("data", chunk => buffers.push(chunk))
      .on("error", rej)
      .on("end", () => res(Buffer.concat(buffers)));
  });
}
