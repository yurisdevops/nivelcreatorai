import test from "node:test";
import assert from "node:assert/strict";
import { base64UrlDecode, base64UrlEncode, encryptPayload } from "../src/webpush.js";

const encoder = new TextEncoder();

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

test("push payloads decrypt with the browser's keys (RFC 8291 aes128gcm)", async () => {
  // Play the browser: create the subscription keys, encrypt, then decrypt as the push client would.
  const browserKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const browserPublic = new Uint8Array(await crypto.subtle.exportKey("raw", browserKeys.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  const message = JSON.stringify({ title: "Entrega amanhã: Natura", body: "Confira os entregáveis." });
  const body = await encryptPayload({ p256dh: base64UrlEncode(browserPublic), auth: base64UrlEncode(authSecret) }, message);

  const salt = body.slice(0, 16);
  assert.equal(new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0), 4096);
  const keyLength = body[20];
  assert.equal(keyLength, 65);
  const serverPublic = body.slice(21, 21 + keyLength);
  const ciphertext = body.slice(21 + keyLength);
  const serverKey = await crypto.subtle.importKey("raw", serverPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: serverKey }, browserKeys.privateKey, 256));
  const keyInfo = new Uint8Array([...encoder.encode("WebPush: info\0"), ...browserPublic, ...serverPublic]);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, aes, ciphertext));
  assert.equal(plain[plain.length - 1], 2);
  assert.equal(new TextDecoder().decode(plain.slice(0, -1)), message);
});

test("base64url helpers round-trip without padding", () => {
  const bytes = crypto.getRandomValues(new Uint8Array(33));
  const encoded = base64UrlEncode(bytes);
  assert.doesNotMatch(encoded, /[+/=]/);
  assert.deepEqual(base64UrlDecode(encoded), bytes);
});
