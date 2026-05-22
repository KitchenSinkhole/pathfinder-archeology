import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '@/lib/env';

// AES-256-GCM AEAD for the ESI tokens stored on `ap_character`. This is the
// only place tokens are wrapped/unwrapped; the DB holds the ciphertext blob.
// SPEC §7 ("encrypted at rest, pgcrypto or app-layer AEAD").

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce, the GCM standard
const AUTH_TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const decoded = Buffer.from(env.ESI_TOKEN_ENC_KEY, 'base64');
  if (decoded.length !== 32) {
    throw new Error(
      `ESI_TOKEN_ENC_KEY must decode to 32 bytes (got ${decoded.length}); generate with \`openssl rand -base64 32\``,
    );
  }
  cachedKey = decoded;
  return cachedKey;
}

/** Encrypt a token. Output is base64 of `iv || authTag || ciphertext`. */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/** Inverse of {@link encryptToken}. Throws if the auth tag does not verify. */
export function decryptToken(blob: string): string {
  const buf = Buffer.from(blob, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
