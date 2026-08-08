import crypto from 'node:crypto';

/** URL-safe random string. */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** 128-bit hex id, e.g. for OAuth transaction ids. */
export function randomId(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function sha256(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Base64url of the SHA-256 of input (PKCE challenge). */
export function sha256Base64Url(input: string): string {
  return crypto.createHash('sha256').update(input).digest('base64url');
}

/** OAuth state parameter (also used as the OAuth transaction id key). */
export function generateState(): string {
  return randomToken(24);
}

/** PKCE S256 pair. */
export function generatePkce(): { verifier: string; challenge: string; method: 'S256' } {
  const verifier = randomToken(48);
  return { verifier, challenge: sha256Base64Url(verifier), method: 'S256' };
}

/** Idempotency key for a delivery (uuid v4). */
export function uuid(): string {
  return crypto.randomUUID();
}

/** Constant-time comparison (webhook signatures, verify tokens). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
