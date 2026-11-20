// Inner Excellence Journal: Cloudflare Worker (Hono) backed by D1.
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { admin } from "./admin.tsx";
import { flash, isSecure, newApp, render, requireLogin, sessionMiddleware, str } from "./app.tsx";
import {
  SESSION_COOKIE, SESSION_SECONDS, consumeLoginToken, createSession, destroySession, findOrCreateUser,
  isAllowedEmail, issueLoginToken, looksLikeEmail, normalizeEmail,
} from "./auth.ts";
import { escapeHtml, sendEmail } from "./email.ts";
import { PrivacyPage } from "./privacy.tsx";
import { openVault } from "./vault.ts";
import {
  AccountPage, ContactUsPage, ErrorPage, IndexPage, JournalPage, LoginPage, VerifyPage, type JournalRow,
} from "./views.tsx";

const app = newApp();
app.use("*", secureHeaders(), csrf(), sessionMiddleware);

// ---------- Public pages ----------
app.get("/contact-us", (c) => render(c, "Contact-Us", <ContactUsPage />));
app.get("/privacy-policy", (c) => render(c, "Privacy policy", <PrivacyPage />));

// ---------- Login (emailed one-time link; no passwords) ----------
const GENERIC_SENT = "If that email is registered with us, a login link has been sent. It expires in 15 minutes.";

app.get("/login", (c) => (c.get("user") ? c.redirect("/") : render(c, "Log In", <LoginPage />)));

app.post("/login", async (c) => {
  const email = normalizeEmail((await c.req.parseBody()).email);
  if (!looksLikeEmail(email)) {
    flash(c, "Please enter a valid email address.");
    return render(c, "Log In", <LoginPage />, 400);
  }
  // Same response whether or not the email is known, so it can't be used to probe for accounts.
  const { allowed } = await isAllowedEmail(c.env, email);
  if (allowed) {
    const token = await issueLoginToken(c.env.DB, email, c.req.header("CF-Connecting-IP") ?? null);
    if (token) {
      const link = `${new URL(c.req.url).origin}/login/verify?token=${token}`;
      if (c.env.PRODUCTION !== "true") console.log(`[dev] login link for ${email}: ${link}`);
      c.executionCtx.waitUntil(
        sendEmail(
          c.env,
          email,
          "Your IX Journals login link",
          `<h3>Hello! Someone requested a login link for ${escapeHtml(email)}.</h3><hr>
           If it was you, click <a href="${link}">here</a> to sign in. The link works once and expires in 15 minutes.<br>
           Or copy and paste this into your browser:<br>${link}<br>
           <strong>If you didn't request this, you can ignore this email.</strong>`,
        ),
      );
    }
  }
  flash(c, GENERIC_SENT);
  return c.redirect("/login");
});

// GET only shows a button. Email scanners prefetch links, and must not be able to burn the token.
app.get("/login/verify", (c) => {
  const token = c.req.query("token") ?? "";
  return render(c, "Log In", <VerifyPage token={token} />);
});

app.post("/login/verify", async (c) => {
  const token = str((await c.req.parseBody()).token);
  const email = token ? await consumeLoginToken(c.env.DB, token) : null;
  const user = email ? await findOrCreateUser(c.env, email) : null;
  if (!user) {
    flash(c, "That login link is invalid or has expired. Please request a new one.");
    return c.redirect("/login");
  }
  const session = await createSession(c.env.DB, user.id);
  setCookie(c, SESSION_COOKIE, session, { path: "/", httpOnly: true, sameSite: "Lax", secure: isSecure(c), maxAge: SESSION_SECONDS });
  return c.redirect("/");
});

app.post("/logout", async (c) => {
  await destroySession(c.env.DB, getCookie(c, SESSION_COOKIE));
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.redirect("/login");
});

// ---------- Account ----------
app.get("/account", requireLogin, (c) => {
  const u = c.get("user")!;
  return render(c, "Account Management", <AccountPage email={u.email} name={u.name} />);
});

app.post("/account", requireLogin, async (c) => {
  const name = str((await c.req.parseBody()).name).trim().slice(0, 200);
  if (name) await c.env.DB.prepare("UPDATE users SET name = ? WHERE id = ?").bind(name, c.get("user")!.id).run();
  flash(c, "Your account details have been updated (if you changed anything).");
  return c.redirect("/");
});

// ---------- Journals ----------
type DbJournal = { id: number; time_crte: string; submitted: number; resp_sent: number; content: string | null; response: string | null };

app.get("/", requireLogin, async (c) => {
  const vault = await openVault(c.env);
  const { results } = await c.env.DB
    .prepare("SELECT id, time_crte, submitted, resp_sent, content, response FROM journals WHERE user_id = ? ORDER BY submitted, time_crte DESC, id DESC")
    .bind(c.get("user")!.id)
    .all<DbJournal>();
  const posts: JournalRow[] = await Promise.all(
    results.map(async (j) => ({
      id: j.id,
      time_crte: j.time_crte,
      submitted: j.submitted,
      content: await vault.dec("content", j.id, j.content),
      // Draft responses stay hidden until the admin sends them.
      response: j.resp_sent ? await vault.dec("response", j.id, j.response) : null,
    })),
  );
  return render(c, "Homepage", <IndexPage posts={posts} />);
});

// Visiting /journal starts a new entry (kept from the original app).
app.get("/journal", requireLogin, async (c) => {
  const r = await c.env.DB.prepare("INSERT INTO journals (user_id) VALUES (?)").bind(c.get("user")!.id).run();
  return c.redirect(`/journals/${r.meta.last_row_id}`);
});

const ownJournal = (c: Parameters<typeof render>[0], id: number) =>
  c.env.DB.prepare("SELECT id, content FROM journals WHERE id = ? AND user_id = ?").bind(id, c.get("user")!.id).first<{ id: number; content: string | null }>();

app.get("/journals/:id{[0-9]+}", requireLogin, async (c) => {
  const id = Number(c.req.param("id"));
  const row = await ownJournal(c, id);
  if (!row) return c.redirect("/journal"); // not theirs / doesn't exist: start a blank one
  const vault = await openVault(c.env);
  return render(c, "Journal", <JournalPage postId={id} content={await vault.dec("content", id, row.content)} />);
});

app.post("/journals/:id{[0-9]+}", requireLogin, async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user")!;
  if (!(await ownJournal(c, id))) return c.redirect("/journal");
  const form = await c.req.parseBody();
  const content = str(form.journal);
  const action = str(form.submit_button);

  if (action === "pubAndSend") {
    const vault = await openVault(c.env);
    await c.env.DB
      .prepare("UPDATE journals SET content = ?, submitted = 1, time_updt = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
      .bind(await vault.enc("content", id, content), id, user.id)
      .run();
    const who = user.name ? `${escapeHtml(user.name)} <i>(${escapeHtml(user.email)})</i>` : escapeHtml(user.email);
    const body = `<h3>${who} submitted a new entry.</h3><hr>
      <p>${escapeHtml(content).replace(/\n/g, "<br>")}</p><hr>
      <i><a href="${new URL(c.req.url).origin}/admin/respond/${id}">You can access it here.</a></i>
      <p>Thanks, the IX Journal Bot</p><hr>
      <p><i>This is an automated message. Please do not reply to this email.</i></p>`;
    for (const to of c.env.ADMIN_EMAILS.split(",").map((e) => e.trim()).filter(Boolean)) {
      if (c.env.PRODUCTION === "true") c.executionCtx.waitUntil(sendEmail(c.env, to, "[INFO] New Entry", body));
      else console.log(`[dev] "sent" email to ${to}: ${body}`);
    }
    flash(c, "Successfully submitted!");
    return render(c, "Journal", <JournalPage postId={id} content={content} />);
  }
  if (action === "deleteDraft") {
    await c.env.DB.prepare("DELETE FROM journals WHERE id = ? AND user_id = ?").bind(id, user.id).run();
    flash(c, "I deleted your journal entry.");
    console.log(JSON.stringify({ msg: "journal deleted", user: user.id, journal: id })); // never log the content
    return c.redirect("/");
  }
  return c.redirect("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
});

app.post("/journals/:id{[0-9]+}/autosave", requireLogin, async (c) => {
  const id = Number(c.req.param("id"));
  if (!(await ownJournal(c, id))) return c.json({ success: false }, 404);
  const vault = await openVault(c.env);
  const content = str((await c.req.parseBody()).content);
  await c.env.DB
    .prepare("UPDATE journals SET content = ? WHERE id = ? AND user_id = ?")
    .bind(await vault.enc("content", id, content), id, c.get("user")!.id)
    .run();
  return c.json({ success: true });
});

app.get("/unsubscribe", (c) => {
  flash(c, "This has not been implemented yet. Please contact titus@innerexcellence.com to unsubscribe.");
  return c.redirect("/");
});

app.route("/admin", admin);

// ---------- Errors ----------
app.notFound((c) => render(c, "Error Page", <ErrorPage message="Page not found." />, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse(); // e.g. CSRF rejection
  console.error(JSON.stringify({ msg: "unhandled error", error: String(err), stack: err.stack, path: new URL(c.req.url).pathname }));
  c.executionCtx.waitUntil(
    sendEmail(c.env, c.env.ERROR_EMAIL, "[ERROR] Server Error", `Hey, this is just a message to indicate that the server has encountered an error: ${escapeHtml(String(err))}`),
  );
  c.set("pending", ["Sorry, there was an error. If the issue persists, please contact us. Thanks!"]);
  return render(c, "Error Page", <ErrorPage message="Something went wrong on our end." />, 500);
});

export default app satisfies ExportedHandler<Env>;
