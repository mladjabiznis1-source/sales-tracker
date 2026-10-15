// Shared helpers for every edge function: per-student access codes, JSON replies, env access.
import { CODE_HASHES } from "./code-hashes.js";

export const env = (name: string): string => Netlify.env.get(name)?.trim() ?? "";

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type User = { id: string; admin: boolean };

/**
 * Who is calling. Each student has their own code (only its SHA-256 lives in code-hashes.js);
 * the ACCESS_CODE env var is the owner's admin code. The user id is derived from the code's
 * hash, so a profile and its history can only be reached with that exact code.
 */
export async function getUser(req: Request): Promise<User | null> {
  const supplied = (req.headers.get("x-access-code") ?? "").trim().toUpperCase();
  if (!supplied || supplied.length > 64) return null;
  const hash = await sha256(supplied);
  const admin = env("ACCESS_CODE");
  if (admin && hash === (await sha256(admin.toUpperCase()))) return { id: hash.slice(0, 32), admin: true };
  if (CODE_HASHES.has(hash)) return { id: hash.slice(0, 32), admin: false };
  return null;
}

/** For routes that only need "is this a valid code": returns an error Response, or null if allowed. */
export async function gate(req: Request): Promise<Response | null> {
  return (await getUser(req)) ? null : json({ error: "Wrong access code." }, 401);
}
