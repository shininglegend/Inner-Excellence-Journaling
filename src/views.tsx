import type { Child } from "hono/jsx";
import type { User } from "./auth.ts";

// SQLite CURRENT_TIMESTAMP ("YYYY-MM-DD HH:MM:SS", UTC) -> "November 05, 2026"
export function formatDate(value: string): string {
  const d = new Date(value.replace(" ", "T") + "Z");
  return d.toLocaleDateString("en-US", { month: "long", day: "2-digit", year: "numeric", timeZone: "UTC" });
}

type LayoutProps = { title: string; user: User | null; path: string; flashes: string[]; children?: Child };

export function Layout({ title, user, path, flashes, children }: LayoutProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="initial-scale=1, width=device-width" />
        <link
          href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css"
          rel="stylesheet"
          integrity="sha384-rbsA2VBKQhggwzxH7pPCaAqO46MgnOM80zW1RWuH61DGLwZJEdK2Kadq2F9CUG65"
          crossorigin="anonymous"
        />
        <script
          src="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/js/bootstrap.bundle.min.js"
          integrity="sha384-kenU1KFdBIe4zVF0s0G1M5b4hcpxyD9F7jL+jjXkk+Q2h455rYXK/7HAuoJl+0I4"
          crossorigin="anonymous"
        ></script>
        <link href="/static/favicon.ico" rel="icon" />
        <link href="/static/styles.css" rel="stylesheet" />
        <script src="/static/scripts.js"></script>
        <title>IX Journal: {title}</title>
      </head>
      <body>
        <nav class="bg-light border navbar navbar-expand-xl navbar-light" id="mainNavBar">
          <div class="container-fluid allcaps">
            <a class="navbar-brand" href="/">
              <span class="blue">Inner Excellence&#174; Journal</span>
            </a>
            <button
              aria-controls="navbar"
              aria-expanded="false"
              aria-label="Toggle navigation"
              class="navbar-toggler"
              data-bs-target="#navbar"
              data-bs-toggle="collapse"
              type="button"
            >
              <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbar">
              {user ? (
                <>
                  {user.admin && path.startsWith("/admin") ? (
                    <ul class="navbar-nav custom-nav ms-auto mt-2">
                      <li class="nav-item"><a class="nav-link" href="/admin/client-journals">View Journals</a></li>
                      <li class="nav-item"><a class="nav-link" href="/admin/clients">Manage Clients</a></li>
                      <li class="nav-item"><a class="nav-link" href="/admin/add-client">Add Client</a></li>
                      <li class="nav-item"><a class="nav-link" href="/">Back to Client View</a></li>
                    </ul>
                  ) : (
                    <ul class="navbar-nav custom-nav ms-auto mt-2">
                      <li class="nav-item"><a class="nav-link" href="/">Your Journals</a></li>
                      <li class="nav-item"><a class="nav-link" href="/journal">New Entry</a></li>
                      <li class="nav-item"><a class="nav-link" href="https://innerexcellence.com/newsletter">Newsletter</a></li>
                      {user.admin && (
                        <li class="nav-item"><a class="nav-link" href="/admin/client-journals">Admin View</a></li>
                      )}
                    </ul>
                  )}
                  <ul class="navbar-nav custom-nav ms-auto mt-2">
                    <li class="nav-item"><a class="nav-link" href="/account">Account</a></li>
                    <li class="nav-item">
                      <form action="/logout" method="post" class="d-inline">
                        <button type="submit" class="nav-link btn btn-link allcaps">Log Out</button>
                      </form>
                    </li>
                  </ul>
                </>
              ) : (
                <ul class="navbar-nav custom-nav ms-auto mt-2">
                  <li class="nav-item"><a class="nav-link" href="/contact-us">Contact Us</a></li>
                  <li class="nav-item"><a class="nav-link" href="/login">Log In</a></li>
                </ul>
              )}
            </div>
          </div>
        </nav>

        {flashes.length > 0 && (
          <header>
            <div class="alert alert-primary alert-dismissible fade show mb-0 text-center" role="alert">
              {flashes.join(" ")}
              <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
          </header>
        )}
        <div id="page-container">
          <div id="content-wrap">
            <main class="container-fluid py-5">{children}</main>
          </div>
          <footer class="mb-5 small text-center text-muted" id="footer">
            {user && (
              <p>
                Want inspiration? Read the <a href="https://innerexcellence.com/newsletter/">latest IX newsletters!</a>
              </p>
            )}
            <hr />
            <div class="container">
              <p>
                &copy; 2023 Inner Excellence. All Rights Reserved.
                <br />
                Use of this website constitutes acceptance of our <a href="/privacy-policy">Privacy Policy</a>.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}

// ---- Auth pages ----

export const LoginPage = () => (
  <div class="auth-card text-center">
    <h2 class="mb-3">Log In</h2>
    <form action="/login" method="post">
      <label for="email" class="visually-hidden">Email address</label>
      <input autocomplete="email" autofocus class="form-control form-control-lg" id="email" name="email" placeholder="Email address" type="email" required />
      <button class="btn btn-primary btn-lg w-100 mt-2" type="submit">Email Me a Login Link</button>
    </form>
    <p class="form-text mt-3">
      No password needed. We'll email you a link that signs you in. Only invited clients can log in.
    </p>
  </div>
);

export const VerifyPage = ({ token }: { token: string }) => (
  <div class="auth-card text-center">
    <h2 class="mb-3">Almost there</h2>
    <form action="/login/verify" method="post">
      <input type="hidden" name="token" value={token} />
      <p>Click below to finish signing in.</p>
      <button class="btn btn-primary btn-lg w-100" type="submit">Sign In</button>
    </form>
  </div>
);

// ---- Client pages ----

export type JournalRow = {
  id: number;
  time_crte: string;
  submitted: number;
  content: string | null;
  response: string | null;
};

export const IndexPage = ({ posts }: { posts: JournalRow[] }) => (
  <div class="journals">
    <div class="d-grid gap-2 col-6 mx-auto">
      <a href="/journal" class="btn btn-secondary jbutton" role="button">Make a new entry</a>
    </div>
    {posts.length > 0 ? (
      <div class="section">
        <h2 class="text-center">Your Posts</h2>
        <table class="table">
          <tbody>
            {posts.map((j) => (
              <>
                <tr class="row">
                  <td class="col">
                    {formatDate(j.time_crte)}{" "}
                    {j.submitted !== 1 ? (
                      <span class="badge text-bg-secondary">Draft</span>
                    ) : j.response ? (
                      <span class="badge text-bg-success">Responded</span>
                    ) : (
                      <span class="badge text-bg-light border">Awaiting response</span>
                    )}
                  </td>
                </tr>
                <tr class={"row clickable-row" + (j.response ? " distinct" : "")} data-href={`/journals/${j.id}`}>
                  <td class="col goto"></td>
                  {j.content ? (
                    <td class="col text-center jcontent"><div class="clamp">{j.content}</div></td>
                  ) : (
                    <td class="col text-center jcontent"><i>This seems to be an empty draft.</i></td>
                  )}
                  {j.submitted === 1 ? (
                    j.response ? (
                      <td class="col text-end jresponse"><div class="clamp">{j.response}</div></td>
                    ) : (
                      <td class="col text-end jresponse"><i>No response yet.</i></td>
                    )
                  ) : (
                    <td class="col text-end jresponse"><i>You haven't submitted this yet.</i></td>
                  )}
                </tr>
              </>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <h3 class="text-center">You have no posts yet.</h3>
    )}
  </div>
);

export const JournalPage = ({ postId, content }: { postId: number; content: string | null }) => (
  <div class="text-center journal-area">
    <h1>Welcome to the Journaling Area!</h1>
    <p>Feel free to express thoughts, opinions, mindset, reactions, and more!</p>
    <form action={`/journals/${postId}`} method="post">
      <div class="container">
        <div class="mb-3">
          <label for="journal" class="visually-hidden">Journal here!</label>
          <textarea autocomplete="off" aria-label="Journal" class="form-control journal fs-3" data-post-id={String(postId)} placeholder="Journal here!" id="journal" name="journal" rows={13}>{content ?? ""}</textarea>
        </div>
        <div id="save-indicator" class="text-center mt-2"></div>
        <div class="row g-3">
          <div class="col-lg">
            <button class="btn btn-outline-success" name="submit_button" value="pubAndSend" type="submit">I'm Finished</button>
          </div>
          <div class="col-lg">
            <button class="btn btn-outline-danger" name="submit_button" value="deleteDraft" type="submit">Delete Draft</button>
          </div>
        </div>
      </div>
    </form>
  </div>
);

export const AccountPage = ({ email, name }: { email: string; name: string | null }) => (
  <div class="auth-card text-center">
    <h3 class="mb-3">Account</h3>
    <p>Email: <strong>{email}</strong></p>
    <p>To change your email associated with your account, please <a href="/contact-us">contact us</a>.</p>
    <form action="/account" method="post">
      <input autocomplete="off" autofocus class="form-control mx-auto w-auto" id="name" name="name" placeholder="Name" type="text" value={name ?? ""} />
      <button class="btn btn-primary" type="submit">Update</button>
    </form>
  </div>
);

export const ContactUsPage = () => (
  <div class="text-center">
    <a class="btn btn-success" href="https://innerexcellence.com/">Please contact us via this page instead.</a>
  </div>
);

export const ErrorPage = ({ message }: { message: string }) => (
  <div class="text-center">
    <h1>We encountered an error. <a href="/">Go home?</a></h1>
    <p>{message}</p>
  </div>
);

// ---- Admin pages ----

export type AdminJournalRow = JournalRow & { name: string | null; email: string };

const who = (j: AdminJournalRow) => j.name || j.email;

export const ClientJournalsPage = ({ fresh, old }: { fresh: AdminJournalRow[]; old: AdminJournalRow[] }) => (
  <div class="section journals">
    <h2>Client Journals</h2>
    <table class="table">
      <tbody>
        {fresh.map((j) => (
          <>
            <tr class="row"><td class="col">{formatDate(j.time_crte)}</td></tr>
            <tr class="row">
              <td class="col goto"><a href={`/admin/respond/${j.id}`}>Open</a></td>
              <td class="col">{who(j)}</td>
              <td class="col"><div class="clamp">{j.content}</div></td>
              <td class="col">
                {j.response ? <div class="clamp">Draft: <i>{j.response}</i></div> : <i>You haven't responded to this journal yet.</i>}
              </td>
            </tr>
          </>
        ))}
      </tbody>
    </table>
    <hr />
    <h2>Already responded</h2>
    <table class="table">
      <tbody>
        {old.map((j) => (
          <>
            <tr class="row"><td class="col">{formatDate(j.time_crte)}</td></tr>
            <tr class="row">
              <td class="col goto"><a href={`/admin/respond/${j.id}`}>Open</a></td>
              <td class="col">{who(j)}</td>
              <td class="col"><div class="clamp">{j.content}</div></td>
              <td class="col"><div class="clamp">{j.response}</div></td>
            </tr>
          </>
        ))}
      </tbody>
    </table>
  </div>
);

export const RespondPage = ({ postId, content, response }: { postId: number; content: string | null; response: string | null }) => (
  <div class="text-center journal-area">
    <form action="" method="post">
      <div class="container">
        <div class="row g-3">
          <h1 class="text-start col-lg">Client Journal here:</h1>
          <h1 class="text-end col-lg">Respond here:</h1>
        </div>
        <div class="input-group mb-3">
          <label for="journal" class="visually-hidden">Journal is here!</label>
          <textarea aria-label="Journal" class="form-control journal fs-3" disabled id="journal" name="journal" rows={13}>{content ?? ""}</textarea>
          <label for="response" class="visually-hidden">Respond here!</label>
          <textarea aria-label="Respond" class="form-control journal fs-3" data-post-id={String(postId)} id="response" name="response" placeholder="Respond to the journal!" rows={13}>{response ?? ""}</textarea>
        </div>
        <div id="save-indicator" class="text-center mt-2"></div>
        <div class="row g-2">
          <div class="col-lg">
            <button class="btn btn-outline-success" name="submit_button" value="sendResp" type="submit">Send Response</button>
          </div>
          <div class="col-lg">
            <button class="btn btn-outline-danger" name="submit_button" value="deleteDraftR" type="submit">Delete Response</button>
          </div>
        </div>
      </div>
    </form>
  </div>
);

export type PersonRow = { name: string | null; email: string; joined: string };
export type InviteRow = { email: string; admin: number; created: string };

const PeopleTable = ({ rows }: { rows: PersonRow[] }) => (
  <table class="table">
    <thead>
      <tr class="row">
        <td class="col">Name</td>
        <td class="col">Email</td>
        <td class="col">Joined</td>
      </tr>
    </thead>
    <tbody>
      {rows.map((p) => (
        <tr class="row">
          <td class="col">{p.name || "No name provided."}</td>
          <td class="col email-wrap">{p.email}</td>
          <td class="col">{formatDate(p.joined)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

export const ClientsPage = ({ admins, clients, invites }: { admins: PersonRow[]; clients: PersonRow[]; invites: InviteRow[] }) => (
  <div class="section clients">
    <h2 class="text-center">List of Clients</h2>
    <h3>Clients</h3>
    <PeopleTable rows={clients} />
    {invites.length > 0 && (
      <>
        <hr />
        <h3>Invited (not signed in yet)</h3>
        <table class="table">
          <thead>
            <tr class="row">
              <td class="col">Email</td>
              <td class="col">Admin</td>
              <td class="col">Invited</td>
            </tr>
          </thead>
          <tbody>
            {invites.map((i) => (
              <tr class="row">
                <td class="col email-wrap">{i.email}</td>
                <td class="col">{i.admin ? "Yes" : "No"}</td>
                <td class="col">{formatDate(i.created)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    )}
    <hr />
    <h3>Admins:</h3>
    <PeopleTable rows={admins} />
  </div>
);

export const AddClientPage = () => (
  <div class="container mb-3 text-center">
    <form action="/admin/add-client" method="post">
      <input autocomplete="off" autofocus class="form-control mx-auto w-auto" id="newclientemail" name="newclientemail" placeholder="Email" type="email" required />
      <div class="form-check form-switch mb-3 red" id="check-admin">
        <input class="form-check-input admincheck" id="admincheck" name="admincheck" role="switch" value="1" type="checkbox" />
        <label class="form-check-label" for="admincheck">Should this be an Admin account?</label>
      </div>
      <button class="btn btn-outline-secondary jbutton" type="submit">Add this client</button>
    </form>
  </div>
);
