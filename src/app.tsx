// Shared app plumbing: types, rendering, flash messages, auth guards.
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Child } from "hono/jsx";
import { SESSION_COOKIE, getSessionUser, type User } from "./auth.ts";
import { Layout } from "./views.tsx";

export type AppEnv = {
  Bindings: Env;
  Variables: { user: User | null; incoming: string[]; pending: string[] };
};
export type Ctx = Context<AppEnv>;

const FLASH_COOKIE = "ix_flash";
export const isSecure = (c: Ctx) => new URL(c.req.url).protocol === "https:";

/** Queue a message; it shows on this response if rendered, or on the next page if redirecting. */
export const flash = (c: Ctx, msg: string) => c.get("pending").push(msg);

/** Form fields are `string | File`; we only ever expect strings. */
export const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Loads the session user and handles the flash-message cookie. */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  let incoming: string[] = [];
  const raw = getCookie(c, FLASH_COOKIE);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) incoming = parsed.filter((m): m is string => typeof m === "string");
    } catch {}
  }
  c.set("incoming", incoming);
  c.set("pending", []);
  c.set("user", await getSessionUser(c.env.DB, getCookie(c, SESSION_COOKIE)));

  await next();

  c.res.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  const redirecting = c.res.status >= 300 && c.res.status < 400;
  const carry = [...c.get("incoming"), ...c.get("pending")];
  if (redirecting && carry.length > 0) {
    setCookie(c, FLASH_COOKIE, JSON.stringify(carry), { path: "/", httpOnly: true, sameSite: "Lax", secure: isSecure(c), maxAge: 300 });
  } else if (raw) {
    deleteCookie(c, FLASH_COOKIE, { path: "/" });
  }
};

/** Render a page inside the layout, consuming any pending flash messages. */
export function render(c: Ctx, title: string, body: Child, status: 200 | 400 | 404 | 500 = 200) {
  const flashes = [...(c.get("incoming") ?? []), ...(c.get("pending") ?? [])];
  c.set("incoming", []);
  c.set("pending", []);
  const path = new URL(c.req.url).pathname;
  return c.html(<Layout title={title} user={c.get("user") ?? null} path={path} flashes={flashes}>{body}</Layout>, status);
}

export const requireLogin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("user")) return c.redirect("/login");
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("user")?.admin) return c.redirect("/");
  await next();
};

export const newApp = () => new Hono<AppEnv>();
