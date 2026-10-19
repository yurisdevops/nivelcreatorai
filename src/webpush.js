// Web Push (RFC 8291 payload encryption + RFC 8292 VAPID) with WebCrypto, so the Worker needs no extra library.
const encoder = new TextEncoder();

export function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function concat(...parts) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { out.set(new Uint8Array(part), offset); offset += part.byteLength; }
  return out;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

export async function encryptPayload(subscription, payload) {
  const userPublic = base64UrlDecode(subscription.p256dh);
  const authSecret = base64UrlDecode(subscription.auth);
  const serverKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeys.publicKey));
  const userKey = await crypto.subtle.importKey("raw", userPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: userKey }, serverKeys.privateKey, 256));
  const keyInfo = concat(encoder.encode("WebPush: info\0"), userPublic, serverPublic);
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const contentKey = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);
  const aesKey = await crypto.subtle.importKey("raw", contentKey, "AES-GCM", false, ["encrypt"]);
  const plaintext = concat(encoder.encode(payload), new Uint8Array([2]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext));
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(salt, recordSize, new Uint8Array([serverPublic.byteLength]), serverPublic, ciphertext);
}

async function vapidToken(endpoint, privateJwk, subject) {
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64UrlEncode(encoder.encode(JSON.stringify({
    aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject
  })));
  const key = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(`${header}.${claims}`));
  return `${header}.${claims}.${base64UrlEncode(signature)}`;
}

export function pushConfigured(env) {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_JWK);
}

export async function sendPush(env, subscription, message) {
  const privateJwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const body = await encryptPayload(subscription, JSON.stringify(message));
  const token = await vapidToken(subscription.endpoint, privateJwk, env.VAPID_SUBJECT || "mailto:contato@nivelstudio.com.br");
  return fetch(subscription.endpoint, {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(10000),
    headers: { authorization: `vapid t=${token}, k=${env.VAPID_PUBLIC_KEY}`, "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream", ttl: "86400", urgency: "normal" },
    body
  });
}
