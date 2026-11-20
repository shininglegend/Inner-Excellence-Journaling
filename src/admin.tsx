// /admin/* routes. Everything here requires an admin session.
import { newApp, flash, render, requireAdmin, requireLogin, str } from "./app.tsx";
import { looksLikeEmail, normalizeEmail } from "./auth.ts";
import { escapeHtml, sendEmail } from "./email.ts";
import { openVault } from "./vault.ts";
import {
  AddClientPage, ClientJournalsPage, ClientsPage, RespondPage,
  type AdminJournalRow, type InviteRow, type PersonRow,
} from "./views.tsx";

export const admin = newApp();
admin.use("*", requireLogin, requireAdmin);

admin.get("/add-client", (c) => render(c, "Add Client", <AddClientPage />));

admin.post("/add-client", async (c) => {
  const form = await c.req.parseBody();
  const email = normalizeEmail(form.newclientemail);
  if (!looksLikeEmail(email)) {
    flash(c, "Something went wrong. Form Not Filled. Contact support if this keeps happening.");
    return c.redirect("/");
  }
  const existing = await c.env.DB.prepare("SELECT 1 AS x FROM users WHERE email = ?").bind(email).first();
  if (existing) {
    flash(c, `${email} already has an account.`);
    return c.redirect("/admin/clients");
  }
  const isAdmin = str(form.admincheck) !== "";
  await c.env.DB
    .prepare("INSERT INTO invites (email, admin) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET admin = excluded.admin, created = CURRENT_TIMESTAMP")
    .bind(email, isAdmin ? 1 : 0)
    .run();
  const loginUrl = `${new URL(c.req.url).origin}/login`;
  c.executionCtx.waitUntil(
    sendEmail(
      c.env,
      email,
      "Inner Excellence Journalling Invitation",
      `<h2>Welcome to Inner Excellence!</h2><hr>
       <h3>We're so glad to have you journalling with us.</h3>
       <p>Please visit <a href="${loginUrl}">${loginUrl}</a> and enter this email address (${escapeHtml(email)}). We'll email you a link that signs you in. There's no password to remember.</p>`,
    ),
  );
  flash(c, `${email} was successfully added${isAdmin ? " as admin" : ""}. We emailed them an invitation.`);
  return c.redirect("/admin/clients");
});

admin.get("/clients", async (c) => {
  const db = c.env.DB;
  const people = (flag: number) =>
    db.prepare("SELECT name, email, joined FROM users WHERE admin = ? ORDER BY joined").bind(flag).all<PersonRow>();
  const [admins, clients, invites] = await Promise.all([
    people(1),
    people(0),
    db.prepare("SELECT email, admin, created FROM invites ORDER BY created").all<InviteRow>(),
  ]);
  return render(c, "Clients", <ClientsPage admins={admins.results} clients={clients.results} invites={invites.results} />);
});

type RawAdminJournal = Omit<AdminJournalRow, "content" | "response"> & { content: string | null; response: string | null };

admin.get("/client-journals", async (c) => {
  const vault = await openVault(c.env);
  const list = async (sent: number): Promise<AdminJournalRow[]> => {
    const { results } = await c.env.DB
      .prepare(
        `SELECT j.id, j.time_crte, j.submitted, u.name, u.email, j.content, j.response
         FROM journals j JOIN users u ON j.user_id = u.id
         WHERE j.submitted = 1 AND j.resp_sent = ? AND j.content IS NOT NULL
         ORDER BY j.time_crte DESC, j.id DESC`,
      )
      .bind(sent)
      .all<RawAdminJournal>();
    return Promise.all(
      results.map(async (j) => ({ ...j, content: await vault.dec("content", j.id, j.content), response: await vault.dec("response", j.id, j.response) })),
    );
  };
  const [fresh, old] = await Promise.all([list(0), list(1)]);
  return render(c, "Client's Journals", <ClientJournalsPage fresh={fresh} old={old} />);
});

type JournalRow = { id: number; content: string | null; response: string | null };
const loadJournal = (c: Parameters<typeof render>[0], id: number) =>
  c.env.DB.prepare("SELECT id, content, response FROM journals WHERE id = ?").bind(id).first<JournalRow>();

admin.get("/respond/:id{[0-9]+}", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await loadJournal(c, id);
  if (!row) {
    flash(c, "I couldn't locate that journal. Perhaps it was deleted?");
    return c.redirect("/admin/client-journals");
  }
  const vault = await openVault(c.env);
  return render(c, "Response", <RespondPage postId={id} content={await vault.dec("content", id, row.content)} response={await vault.dec("response", id, row.response)} />);
});

admin.post("/respond/:id{[0-9]+}", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await loadJournal(c, id);
  if (!row) {
    flash(c, "I couldn't locate that journal. Perhaps it was deleted?");
    return c.redirect("/admin/client-journals");
  }
  const vault = await openVault(c.env);
  const form = await c.req.parseBody();
  const response = str(form.response);
  const content = await vault.dec("content", id, row.content);
  const adminId = c.get("user")!.id;
  const action = str(form.submit_button);

  if (action === "saveDraftR" || action === "sendResp") {
    const sent = action === "sendResp" ? 1 : 0;
    await c.env.DB
      .prepare("UPDATE journals SET response = ?, resp_id = ?, resp_sent = ?, time_resp = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE time_resp END WHERE id = ?")
      .bind(await vault.enc("response", id, response), adminId, sent, sent, id)
      .run();
    flash(c, sent ? "I sent your response!" : "I saved your draft response!");
    return render(c, "Response", <RespondPage postId={id} content={content} response={response} />);
  }
  if (action === "deleteDraftR") {
    await c.env.DB.prepare("UPDATE journals SET response = NULL, resp_id = NULL, resp_sent = 0 WHERE id = ?").bind(id).run();
    flash(c, "I deleted your response.");
    console.log(JSON.stringify({ msg: "response deleted", by: adminId, journal: id }));
    return render(c, "Response", <RespondPage postId={id} content={content} response={null} />);
  }
  return c.redirect("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
});

admin.post("/respond/:id{[0-9]+}/autosave", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await loadJournal(c, id);
  if (!row) return c.json({ success: false }, 404);
  const vault = await openVault(c.env);
  const form = await c.req.parseBody();
  await c.env.DB
    .prepare("UPDATE journals SET response = ?, resp_id = ? WHERE id = ?")
    .bind(await vault.enc("response", id, str(form.content)), c.get("user")!.id, id)
    .run();
  return c.json({ success: true });
});
