import { AuthError, assertSameOrigin, readJson } from "./auth.js";
import { resolveEntitlement } from "./quota.js";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const TRIAL_STORAGE = 250 * 1024 * 1024;
const PAID_STORAGE = 2 * 1024 * 1024 * 1024;

function storageLimit(plan) {
  return plan === "trial" ? TRIAL_STORAGE : plan === "paid" ? PAID_STORAGE : 0;
}

function detectedMime(bytes) {
  const ascii = (start, length) => String.fromCharCode(...bytes.subarray(start, start + length));
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(ascii(0, 6))) return "image/gif";
  if (bytes.length >= 5 && ascii(0, 5) === "%PDF-") return "application/pdf";
  if (bytes.length >= 12 && ascii(4, 4) === "ftyp") return "video/mp4";
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "video/webm";
  return null;
}

function cleanName(value) {
  let raw = typeof value === "string" ? value : "";
  try { raw = decodeURIComponent(raw); } catch { throw new AuthError(400, "O nome do arquivo não é válido."); }
  const name = raw.split(/[\\/]/).at(-1).replace(/[\u0000-\u001f\u007f]/g, "_").trim().replace(/^\.+$/, "");
  if (!name || name.length > 160) throw new AuthError(400, "O nome do arquivo deve ter até 160 caracteres.");
  return name;
}

async function hashFile(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function scanForMalware(env, bytes) {
  if (!env.FILE_SCANNER || typeof env.FILE_SCANNER.fetch !== "function"
      || typeof env.FILE_SCANNER_SECRET !== "string" || env.FILE_SCANNER_SECRET.length < 32) {
    throw new AuthError(503, "A varredura de segurança dos arquivos não está configurada.");
  }
  let response;
  try {
    response = await env.FILE_SCANNER.fetch(new Request("https://file-scanner.internal/scan", {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(bytes.byteLength),
        "x-file-scanner-secret": env.FILE_SCANNER_SECRET
      },
      body: bytes
    }));
  } catch {
    throw new AuthError(503, "A varredura de segurança está indisponível. Tente novamente.");
  }
  if (response.status === 422) throw new AuthError(415, "O arquivo foi bloqueado pela verificação de segurança.");
  if (!response.ok) throw new AuthError(503, "A varredura de segurança está indisponível. Tente novamente.");
  let result;
  try { result = await response.json(); } catch {
    throw new AuthError(503, "A resposta da verificação de segurança não é válida.");
  }
  if (result.clean !== true) throw new AuthError(503, "A verificação de segurança não confirmou o arquivo.");
}

async function readBoundedBody(request, maxBytes) {
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError(400, "O conteúdo do arquivo não foi recebido.");
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new AuthError(413, "Cada arquivo pode ter no máximo 25 MB.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function listFiles(request, env, account) {
  const access = await resolveEntitlement(env, account.workspace_id, false);
  const [rows, usage] = await Promise.all([
    env.DB.prepare(`SELECT id, display_name, content_type, byte_size, created_at, sha256
      FROM files WHERE workspace_id=?1 ORDER BY created_at DESC LIMIT 500`).bind(account.workspace_id).all(),
    env.DB.prepare(`SELECT COALESCE(SUM(byte_size),0) AS bytes FROM files WHERE workspace_id=?1`)
      .bind(account.workspace_id).first()
  ]);
  const reserved = await env.DB.prepare(`SELECT COALESCE(SUM(byte_size),0) AS bytes FROM file_upload_reservations
    WHERE workspace_id=?1 AND status='reserved' AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
    .bind(account.workspace_id).first();
  return { files: rows.results || [], storage: { plan: access?.plan || "expired", used: usage.bytes,
    reserved: reserved.bytes, limit: storageLimit(access?.plan), configured: Boolean(env.FILES) } };
}

async function uploadFile(request, env, account) {
  if (!env.FILES) throw new AuthError(503, "O armazenamento privado ainda não foi configurado.");
  assertSameOrigin(request, "application/octet-stream");
  const declaredLength = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(declaredLength) || declaredLength <= 0) throw new AuthError(411, "O tamanho do arquivo não foi informado.");
  if (declaredLength > MAX_FILE_SIZE) throw new AuthError(413, "Cada arquivo pode ter no máximo 25 MB.");
  const displayName = cleanName(request.headers.get("x-file-name") || "");
  const bytes = await readBoundedBody(request, MAX_FILE_SIZE);
  if (!bytes.byteLength || bytes.byteLength > MAX_FILE_SIZE || bytes.byteLength !== declaredLength) {
    throw new AuthError(bytes.byteLength > MAX_FILE_SIZE ? 413 : 400, "O tamanho do arquivo enviado não é válido.");
  }
  const contentType = detectedMime(bytes);
  if (!contentType) throw new AuthError(415, "Use imagem, vídeo ou PDF com conteúdo reconhecido.");
  await scanForMalware(env, bytes);
  const access = await resolveEntitlement(env, account.workspace_id);
  const limit = storageLimit(access.plan);
  await env.DB.prepare(`UPDATE file_upload_reservations SET status='released'
    WHERE workspace_id=?1 AND status='reserved' AND expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
    .bind(account.workspace_id).run();
  await env.DB.prepare(`DELETE FROM file_upload_reservations WHERE workspace_id=?1 AND status IN ('released','completed')
    AND created_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')`).bind(account.workspace_id).run();
  const id = crypto.randomUUID();
  const reservationId = crypto.randomUUID();
  const reservation = await env.DB.prepare(`INSERT INTO file_upload_reservations (id, workspace_id, byte_size, status, expires_at)
    SELECT ?1, ?2, ?3, 'reserved', strftime('%Y-%m-%dT%H:%M:%fZ','now','+15 minutes')
    WHERE (SELECT COALESCE(SUM(byte_size),0) FROM files WHERE workspace_id=?2)
      + (SELECT COALESCE(SUM(byte_size),0) FROM file_upload_reservations
          WHERE workspace_id=?2 AND status='reserved' AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      + ?3 <= ?4`).bind(reservationId, account.workspace_id, bytes.byteLength, limit).run();
  if (!reservation.meta?.changes) throw new AuthError(429, "O armazenamento do seu plano está cheio. Apague arquivos ou altere seu plano.");

  const key = `private/${account.workspace_id}/${id}`;
  const sha256 = await hashFile(bytes);
  try {
    await env.FILES.put(key, bytes, { httpMetadata: { contentType }, customMetadata: { workspace_id: account.workspace_id, sha256 } });
    const saved = await env.DB.batch([
      env.DB.prepare(`INSERT INTO files (id, workspace_id, r2_key, content_type, byte_size, display_name, sha256)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE EXISTS (
          SELECT 1 FROM file_upload_reservations WHERE id=?8 AND status='reserved' AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
        )`).bind(id, account.workspace_id, key, contentType, bytes.byteLength, displayName, sha256, reservationId),
      env.DB.prepare(`UPDATE file_upload_reservations SET status='completed'
        WHERE id=?1 AND status='reserved' AND EXISTS (SELECT 1 FROM files WHERE id=?2 AND workspace_id=?3)`)
        .bind(reservationId, id, account.workspace_id)
    ]);
    if (!saved[0]?.meta?.changes || !saved[1]?.meta?.changes) throw new Error("metadata_commit");
  } catch {
    await env.FILES.delete(key).catch(() => {});
    await env.DB.prepare("UPDATE file_upload_reservations SET status='released' WHERE id=?1 AND status='reserved'")
      .bind(reservationId).run().catch(() => {});
    throw new AuthError(503, "Não foi possível salvar o arquivo com segurança. Tente novamente.");
  }
  return { file: { id, display_name: displayName, content_type: contentType, byte_size: bytes.byteLength,
    created_at: new Date().toISOString(), sha256 }, storage: { used: (await env.DB.prepare(
      "SELECT COALESCE(SUM(byte_size),0) AS bytes FROM files WHERE workspace_id=?1").bind(account.workspace_id).first()).bytes, limit } };
}

async function downloadFile(env, account, id) {
  const file = await env.DB.prepare(`SELECT r2_key, display_name, content_type FROM files WHERE id=?1 AND workspace_id=?2`)
    .bind(id, account.workspace_id).first();
  if (!file) throw new AuthError(404, "Este arquivo não foi encontrado na sua biblioteca.");
  if (!env.FILES) throw new AuthError(503, "O armazenamento privado ainda não foi configurado.");
  const object = await env.FILES.get(file.r2_key);
  if (!object) throw new AuthError(404, "O arquivo não está disponível no armazenamento.");
  const headers = new Headers({
    "content-type": file.content_type,
    "content-length": String(object.size),
    "content-disposition": `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.display_name).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer"
  });
  return new Response(object.body, { status: 200, headers });
}

async function deleteFile(request, env, account, id) {
  assertSameOrigin(request);
  const body = await readJson(request);
  if (body.confirm !== true) throw new AuthError(400, "Confirme a remoção deste arquivo.");
  const file = await env.DB.prepare(`SELECT r2_key, display_name, byte_size FROM files WHERE id=?1 AND workspace_id=?2`)
    .bind(id, account.workspace_id).first();
  if (!file) throw new AuthError(404, "Este arquivo não foi encontrado na sua biblioteca.");
  if (!env.FILES) throw new AuthError(503, "O armazenamento privado ainda não foi configurado.");
  await env.FILES.delete(file.r2_key);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM files WHERE id=?1 AND workspace_id=?2").bind(id, account.workspace_id),
    env.DB.prepare(`INSERT INTO audit_logs (id, workspace_id, actor_user_id, action, target_type, target_id, metadata_json)
      VALUES (?1, ?2, ?3, 'file.deleted', 'file', ?4, ?5)`)
      .bind(crypto.randomUUID(), account.workspace_id, account.auth_subject, id,
        JSON.stringify({ display_name: file.display_name, byte_size: file.byte_size }))
  ]);
  return { deleted: true };
}

export async function filesHandler(request, env, path, account) {
  if (!path.startsWith("/api/files")) return null;
  if (!env.DB) throw new AuthError(503, "O banco de dados ainda não foi configurado.");
  if (path === "/api/files" && request.method === "GET") return listFiles(request, env, account);
  if (path === "/api/files" && request.method === "POST") return uploadFile(request, env, account);
  const download = path.match(/^\/api\/files\/([0-9a-f-]{36})\/content$/i);
  if (download && request.method === "GET") return downloadFile(env, account, download[1]);
  const remove = path.match(/^\/api\/files\/([0-9a-f-]{36})$/i);
  if (remove && request.method === "DELETE") return deleteFile(request, env, account, remove[1]);
  throw new AuthError(405, "Rota ou método não disponível.");
}
