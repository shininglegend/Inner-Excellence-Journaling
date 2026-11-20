// Sessions and one-time login links. Tokens and session ids are stored only as SHA-256 hashes.
import { randomToken, sha256Hex } from "./crypto.ts";

export type User = { id: number; email: string; name: string | null; admin: boolean };

export const SESSION_COOKIE = "ix_session";
export const SESSION_SECONDS = 30 * 24 * 3600;
const LOGIN_LINK_SECONDS = 15 * 60;
const PER_EMAIL_COOLDOWN_SECONDS = 60;
const PER_IP_HOURLY_LIMIT = 10;

const now = () => Math.floor(Date.now() / 1000);

export const normalizeEmail = (s: unknown): string => (typeof s === "string" ? s.trim().toLowerCase() : "");
export const looksLikeEmail = (s: string): boolean => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export async function createSession(db: D1Database, userId: number): Promise<string> {
  const token = randomToken();
  await db
    .prepare("INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), userId, now(), now() + SESSION_SECONDS)
    .run();
  return token;
}

/** Looks the user up on every request, so admin changes take effect immediately. */
export async function getSessionUser(db: D1Database, token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.admin FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id_hash = ? AND s.expires_at > ?`,
    )
    .bind(await sha256Hex(token), now())
    .first<{ id: number; email: string; name: string | null; admin: number }>();
  return row ? { id: row.id, email: row.email, name: row.name, admin: !!row.admin } : null;
}

export async function destroySession(db: D1Database, token: string | undefined): Promise<void> {
  if (token) await db.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256Hex(token)).run();
}

/** May this email receive a login link? Existing users, invited emails and configured admins only. */
export async function isAllowedEmail(env: Env, email: string): Promise<{ allowed: boolean; admin: boolean }> {
  const isConfiguredAdmin = env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).includes(email);
  const user = await env.DB.prepare("SELECT admin FROM users WHERE email = ?").bind(email).first<{ admin: number }>();
  if (user) return { allowed: true, admin: !!user.admin };
  const invite = await env.DB.prepare("SELECT admin FROM invites WHERE email = ?").bind(email).first<{ admin: number }>();
  if (invite) return { allowed: true, admin: !!invite.admin };
  return { allowed: isConfiguredAdmin, admin: isConfiguredAdmin };
}

/** Creates a login token, or returns null when rate-limited. Caller decides who is allowed. */
export async function issueLoginToken(db: D1Database, email: string, ip: string | null): Promise<string | null> {
  const t = now();
  await db.prepare("DELETE FROM login_tokens WHERE expires_at < ?").bind(t).run();
  await db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(t).run();

  const byEmail = await db
    .prepare("SELECT COUNT(*) AS n FROM login_tokens WHERE email = ? AND created_at > ?")
    .bind(email, t - PER_EMAIL_COOLDOWN_SECONDS)
    .first<{ n: number }>();
  if (byEmail && byEmail.n > 0) return null;
  if (ip) {
    const byIp = await db
      .prepare("SELECT COUNT(*) AS n FROM login_tokens WHERE ip = ? AND created_at > ?")
      .bind(ip, t - 3600)
      .first<{ n: number }>();
    if (byIp && byIp.n >= PER_IP_HOURLY_LIMIT) return null;
  }
  const token = randomToken();
  await db
    .prepare("INSERT INTO login_tokens (token_hash, email, ip, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(await sha256Hex(token), email, ip, t, t + LOGIN_LINK_SECONDS)
    .run();
  return token;
}

/** Single-use: the DELETE ... RETURNING makes consumption atomic. Returns the email or null. */
export async function consumeLoginToken(db: D1Database, token: string): Promise<string | null> {
  const row = await db
    .prepare("DELETE FROM login_tokens WHERE token_hash = ? AND expires_at > ? RETURNING email")
    .bind(await sha256Hex(token), now())
    .first<{ email: string }>();
  return row?.email ?? null;
}

/** Turn a verified email into a user row (from an invite or ADMIN_EMAILS if new). */
export async function findOrCreateUser(env: Env, email: string): Promise<User | null> {
  const { allowed, admin } = await isAllowedEmail(env, email);
  if (!allowed) return null;
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO users (email, admin) VALUES (?, ?)").bind(email, admin ? 1 : 0),
    env.DB.prepare("DELETE FROM invites WHERE email = ?").bind(email),
  ]);
  const u = await env.DB.prepare("SELECT id, email, name, admin FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: number; email: string; name: string | null; admin: number }>();
  return u ? { ...u, admin: !!u.admin } : null;
}
