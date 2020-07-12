export async function collectStream(stream) {
  let buffers = [];
  for await(const chunk of stream) {
    buffers.push(chunk);
  }

  return Buffer.concat(buffers);
}
