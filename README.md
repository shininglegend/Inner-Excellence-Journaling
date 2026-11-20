# Inner Excellence Journal

A private journaling site: clients write entries, coaches (admins) respond. Runs on Cloudflare Workers (Hono + JSX) with D1, Workers Static Assets and Cloudflare Email Service.

## How it works

- **Login**: no passwords. Enter your email and we send a one-time link (valid 15 minutes, single use). Only existing users, emails an admin has invited (`/admin/add-client`) and emails in `ADMIN_EMAILS` can get a link.
- **Encryption**: journal entries and responses are encrypted with AES-256-GCM before they are written to D1, using the `ENCRYPTION_KEY` Worker secret. Each ciphertext is bound to its row and column. Admins can read entries through the app; Cloudflare storage only ever holds ciphertext. **Losing the key means losing the entries, so back it up.**
- **Static files** live in `public/` and are served by Workers Static Assets. Everything else is `src/`.

## Local development

```sh
npm install
cp .dev.vars.example .dev.vars        # then set ENCRYPTION_KEY: openssl rand -base64 32
npm run db:migrate:local
npm run dev                           # http://localhost:8787
```

Locally, login links are printed in the dev server output and admin notifications are logged instead of emailed (`PRODUCTION=false` in `.dev.vars`). Sign in as an address from `ADMIN_EMAILS` to bootstrap the first admin.

## Deploy

1. `npx wrangler d1 create ix-journal` and add the returned `database_id` to the `d1_databases` entry in `wrangler.jsonc`.
2. `npm run db:migrate:remote`
3. `openssl rand -base64 32 | npx wrangler secret put ENCRYPTION_KEY`
4. Onboard `innerexcellence.com` for sending: `npx wrangler email sending enable innerexcellence.com`, and add the DNS records it asks for.
5. `npm run deploy`, then attach your domain to the Worker in the dashboard.

## Importing the old Flask database

```sh
ENCRYPTION_KEY=<same value as the secret> node scripts/import-sqlite.ts journals.db > migrate.sql
npx wrangler d1 execute DB --remote --file migrate.sql
```

Users and journals keep their ids, journal text is encrypted on the way in, and unredeemed registration codes become invites. Passwords are not imported, so everyone signs in with an emailed link.
