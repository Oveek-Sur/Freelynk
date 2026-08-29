import { createHash, createCipheriv, randomBytes } from "node:crypto";

/**
 * Payload encryption shared with the Flutter app.
 *
 *   key        = SHA-256(SYNC_SECRET)                -> 32 bytes
 *   iv         = 12 random bytes                     (fresh per response)
 *   ciphertext = AES-256-GCM(plaintext, key, iv)
 *   tag        = 16 byte GCM auth tag
 *
 *   data = base64( iv || ciphertext || tag )
 *
 * The Dart side (lib/core/crypto_service.dart) mirrors this exactly.
 */

const IV_LEN = 12;

export function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptPayload(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LEN);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, ct, tag]).toString("base64");
}

/** Short content hash so the app can skip re-downloading unchanged data. */
export function revisionOf(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex").slice(0, 16);
}

/** Constant-time-ish string compare for shared secrets. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
