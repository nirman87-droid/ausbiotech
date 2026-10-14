import "server-only";
import crypto from "node:crypto";
import { env } from "./env";

// HMAC signing for cookies and personal links. A signed value cannot be changed by the
// visitor without the signature failing, so the server can trust what it reads back.

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (env.isProduction && process.env.ALLOW_DEV_LOGIN !== "1") {
    throw new Error("SESSION_SECRET must be set to at least 32 characters in production.");
  }
  return "local-development-secret-do-not-use-in-production";
}

function mac(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

export function sign(value: string): string {
  return `${value}.${mac(value)}`;
}

export function unsign(token: string | undefined | null): string | null {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const value = token.slice(0, i);
  const given = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(mac(value));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  return value;
}

// Personal links: payload is the person id and an expiry time.
export function makePersonToken(personId: string, days = 90): string {
  const payload = Buffer.from(JSON.stringify({ p: personId, e: Date.now() + days * 86_400_000 })).toString("base64url");
  return sign(payload);
}

export function readPersonToken(token: string): string | null {
  const payload = unsign(token);
  if (!payload) return null;
  try {
    const { p, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof p !== "string" || typeof e !== "number" || e < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

export function randomToken(bytes = 18): string {
  return crypto.randomBytes(bytes).toString("base64url"); // 24 characters for 18 bytes
}
