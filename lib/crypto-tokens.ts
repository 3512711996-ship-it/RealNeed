import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateOpaqueToken(prefix: string) {
  return `${prefix}_${randomBytes(24).toString("base64url")}`;
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatches(token: string, expectedHash: string) {
  const actual = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function buildRecoveryUrl(token: string) {
  return `/recover#token=${encodeURIComponent(token)}`;
}

export function buildDeepDiveUrl(token: string) {
  return `/deep-dive/${encodeURIComponent(token)}`;
}
