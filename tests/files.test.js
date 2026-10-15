import test from "node:test";
import assert from "node:assert/strict";
import { AuthError } from "../src/auth.js";
import { filesHandler } from "../src/files.js";

const workspaceId = "workspace-upload-test";

function uploadEnvironment() {
  const state = { used: 0, queries: [], objects: [] };
  const db = {
    state,
    prepare(sql) {
      const statement = {
        sql,
        params: [],
        bind(...params) { this.params = params; return this; },
        async first() {
          state.queries.push(sql);
          if (sql.includes("trial_start")) return {
            trial_start: new Date(Date.now() - 60_000).toISOString(),
            trial_end: new Date(Date.now() + 86400_000).toISOString(), trial_status: "trialing"
          };
          if (sql.includes("SUM(byte_size)")) return { bytes: state.used };
          return null;
        },
        async run() { state.queries.push(sql); return { meta: { changes: 1 } }; }
      };
      return statement;
    },
    async batch(statements) {
      for (const statement of statements) {
        if (statement.sql.includes("INSERT INTO files")) state.used += statement.params[4];
      }
      return statements.map(() => ({ meta: { changes: 1 } }));
    }
  };
  const FILES = {
    async put(key, bytes, options) { state.objects.push({ key, bytes: new Uint8Array(bytes), options }); },
    async delete(key) { state.objects = state.objects.filter((object) => object.key !== key); },
    async get(key) { return state.objects.find((object) => object.key === key) || null; }
  };
  return { DB: db, FILES, state };
}

function uploadRequest({ name, bytes, declaredLength = bytes.byteLength }) {
  return new Request("https://app.example/api/files", {
    method: "POST",
    headers: {
      origin: "https://app.example",
      "content-type": "application/octet-stream",
      "content-length": String(declaredLength),
      "x-file-name": name
    },
    body: bytes
  });
}

test("upload rejects HTML/script content even when the name claims to be a PDF", async () => {
  const env = uploadEnvironment();
  const bytes = new TextEncoder().encode("<html><script>alert(1)</script></html>");
  const request = uploadRequest({ name: "comprovante.pdf", bytes });
  await assert.rejects(filesHandler(request, env, "/api/files", { workspace_id: workspaceId }),
    (error) => error instanceof AuthError && error.status === 415);
  assert.equal(env.state.objects.length, 0);
  assert.equal(env.state.queries.length, 0);
});

test("upload stores a valid PDF under a server-generated private key and strips traversal from its name", async () => {
  const env = uploadEnvironment();
  const bytes = new TextEncoder().encode("%PDF-1.7\nconteúdo de teste");
  const result = await filesHandler(uploadRequest({ name: "..%2F..%2Fprivate%2Fphoto.pdf", bytes }), env,
    "/api/files", { workspace_id: workspaceId });

  assert.equal(result.file.display_name, "photo.pdf");
  assert.equal(result.file.content_type, "application/pdf");
  assert.equal(env.state.objects.length, 1);
  assert.match(env.state.objects[0].key, new RegExp(`^private/${workspaceId}/[0-9a-f-]{36}$`));
  assert.equal(env.state.objects[0].options.customMetadata.workspace_id, workspaceId);
  assert.equal(env.state.objects[0].options.customMetadata.sha256, result.file.sha256);
});

test("upload rejects an oversized declared body before touching storage", async () => {
  const env = uploadEnvironment();
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
  await assert.rejects(filesHandler(uploadRequest({ name: "large.pdf", bytes, declaredLength: 25 * 1024 * 1024 + 1 }),
    env, "/api/files", { workspace_id: workspaceId }), (error) => error instanceof AuthError && error.status === 413);
  assert.equal(env.state.objects.length, 0);
  assert.equal(env.state.queries.length, 0);
});

test("upload rejects a body whose received size differs from its declared size", async () => {
  const env = uploadEnvironment();
  const bytes = new TextEncoder().encode("%PDF-1.7\nconteúdo");
  await assert.rejects(filesHandler(uploadRequest({ name: "documento.pdf", bytes, declaredLength: bytes.byteLength - 1 }),
    env, "/api/files", { workspace_id: workspaceId }), (error) => error instanceof AuthError && error.status === 400);
  assert.equal(env.state.objects.length, 0);
  assert.equal(env.state.queries.length, 0);
});
