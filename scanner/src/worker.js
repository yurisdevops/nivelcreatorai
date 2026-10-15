import { ClamScanner } from "./container.js";

const MAX_FILE_SIZE = 25 * 1024 * 1024;

function secretMatches(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string" || expected.length < 32) return false;
  const length = Math.max(provided.length, expected.length);
  let difference = provided.length ^ expected.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (provided.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/scan" || request.method !== "POST") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    if (!secretMatches(request.headers.get("x-file-scanner-secret"), env.FILE_SCANNER_SECRET)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (request.headers.get("content-type") !== "application/octet-stream") {
      return Response.json({ error: "unsupported_media_type" }, { status: 415 });
    }
    const length = Number(request.headers.get("content-length"));
    if (!Number.isSafeInteger(length) || length <= 0 || length > MAX_FILE_SIZE) {
      return Response.json({ error: "invalid_size" }, { status: 413 });
    }

    try {
      const slot = crypto.getRandomValues(new Uint32Array(1))[0] % 3;
      const container = env.SCANNER.getByName(`clamav-${slot}`);
      const result = await container.fetch(new Request("http://container/scan", {
        method: "POST",
        headers: { "content-type": "application/octet-stream", "content-length": String(length) },
        body: request.body
      }));
      if (result.status === 200 || result.status === 422) return result;
      return Response.json({ error: "scanner_unavailable" }, { status: 503 });
    } catch {
      return Response.json({ error: "scanner_unavailable" }, { status: 503 });
    }
  }
};

export { ClamScanner };
