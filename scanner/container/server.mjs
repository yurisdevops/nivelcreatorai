import { createServer } from "node:http";
import net from "node:net";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const CLAMD_STREAM_MAX = 30 * 1024 * 1024;

async function readBounded(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_FILE_SIZE) throw Object.assign(new Error("too_large"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

function scan(bytes) {
  if (bytes.length > CLAMD_STREAM_MAX) return Promise.reject(new Error("clamd_stream_limit"));
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: 3310 });
    const response = [];
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      error ? reject(error) : resolve(value);
    };
    socket.setTimeout(120_000, () => finish(new Error("clamd_timeout")));
    socket.once("error", (error) => finish(error));
    socket.on("data", (chunk) => {
      response.push(chunk);
      const text = Buffer.concat(response).toString("utf8");
      if (text.includes("\0")) finish(null, text.replace(/\0.*$/s, "").trim());
    });
    socket.once("connect", () => {
      socket.write(Buffer.from("zINSTREAM\0"));
      for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
        const chunk = bytes.subarray(offset, Math.min(offset + 64 * 1024, bytes.length));
        const length = Buffer.allocUnsafe(4);
        length.writeUInt32BE(chunk.length);
        socket.write(length);
        socket.write(chunk);
      }
      const terminator = Buffer.alloc(4);
      socket.end(terminator);
    });
  });
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/scan") {
    response.writeHead(404).end();
    return;
  }
  const declaredLength = Number(request.headers["content-length"]);
  if (!Number.isSafeInteger(declaredLength) || declaredLength <= 0 || declaredLength > MAX_FILE_SIZE) {
    response.writeHead(413).end(JSON.stringify({ error: "invalid_size" }));
    return;
  }
  try {
    const bytes = await readBounded(request);
    if (bytes.length !== declaredLength) throw Object.assign(new Error("length_mismatch"), { status: 400 });
    const result = await scan(bytes);
    if (result.endsWith(": OK")) {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ clean: true }));
    } else if (result.endsWith(": FOUND")) {
      response.writeHead(422, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ clean: false }));
    } else {
      response.writeHead(503).end(JSON.stringify({ error: "scan_failed" }));
    }
  } catch (error) {
    response.writeHead(error.status || 503, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ error: "scan_failed" }));
  }
});

server.listen(8080, "0.0.0.0");
