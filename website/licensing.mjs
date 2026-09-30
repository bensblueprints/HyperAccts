// HyperAccts license-key and delivery-token utilities.
//
// Self-contained (Node built-ins only, no external deps). Task 491 (post-purchase
// delivery). These functions are used by website/server.mjs to:
//   1. Issue a unique, signed license key after a VERIFIED payment.
//   2. Mint a short-lived, HMAC-signed download token so the paid installer cannot be
//      scraped freely.
//
// Both the key and the token are signed with LICENSE_SECRET (server env, never committed).
// If LICENSE_SECRET is absent, issue() refuses to mint anything, so delivery fails closed.
//
// Format of a license key:
//   HYAC-XXXX-XXXX-XXXX-XXXX  where the final group embeds a truncated HMAC signature.
// This lets an offline verifier (the desktop app, engineering task) confirm a key is
// genuine without a network call, given the same shared secret or the public portion.
//
// The desktop app's offline verification of these keys is an engineering dependency and
// is NOT yet implemented (see docs/BLOCKERS.md and docs/DELIVERY.md).

import crypto from 'node:crypto';

// Alphabet avoids ambiguous characters (0/O, 1/I) for clean typing.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GROUP = 4;
const GROUPS = 4;

function secret() {
  const s = process.env.LICENSE_SECRET;
  if (!s || typeof s !== 'string' || s.length < 16) return null;
  return s;
}

function randomGroup(rng = crypto.randomBytes) {
  const bytes = rng(GROUP);
  let out = '';
  for (let i = 0; i < GROUP; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// Issue a new license key: three random groups + one signature group derived from an
// HMAC over the first three groups. Returns `null` when LICENSE_SECRET is unset so the
// caller can fail closed rather than emit a forge-able key.
export function issueLicenseKey() {
  const s = secret();
  if (!s) return null;
  const a = randomGroup();
  const b = randomGroup();
  const c = randomGroup();
  const hmac = crypto.createHmac('sha256', s).update(`${a}-${b}-${c}`).digest();
  let sig = '';
  for (let i = 0; i < GROUP; i += 1) sig += ALPHABET[hmac[i] % ALPHABET.length];
  return `HYAC-${a}-${b}-${c}-${sig}`;
}

// Verify a license key's embedded signature. Returns true only if the signature group
// matches the HMAC (requires the same LICENSE_SECRET). Intended for server-side checks
// and to document the contract the desktop app's offline verifier must implement.
export function verifyLicenseKey(key) {
  const s = secret();
  if (!s || typeof key !== 'string') return false;
  const parts = key.trim().toUpperCase().split('-');
  if (parts.length !== 5 || parts[0] !== 'HYAC') return false;
  const body = parts.slice(1, 4).join('-');
  const sig = parts[4];
  const hmac = crypto.createHmac('sha256', s).update(body).digest();
  let expected = '';
  for (let i = 0; i < GROUP; i += 1) expected += ALPHABET[hmac[i] % ALPHABET.length];
  if (sig.length !== expected.length) return false;
  let ok = true;
  for (let i = 0; i < sig.length; i += 1) {
    if (sig[i] !== expected[i]) ok = false;
  }
  return ok;
}

// Mint a short-lived delivery token authorizing a single installer download.
// The token is `payload.exp.~.base64url(payload,hmac)` and expires after TTL seconds.
// Returns `null` when LICENSE_SECRET is unset.
export function mintDeliveryToken(sessionId, ttlSeconds) {
  const s = secret();
  if (!s || !sessionId) return null;
  const ttl = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? Math.floor(ttlSeconds) : 3600;
  const payload = Buffer.from(
    JSON.stringify({ sid: sessionId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttl }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', s).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

// Validate a delivery token and return its payload, or `null` if absent/invalid/expired.
export function verifyDeliveryToken(token) {
  const s = secret();
  if (!s || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', s).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (Date.now() / 1000 > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}
