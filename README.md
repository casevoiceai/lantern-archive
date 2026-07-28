# Lantern Archive

AI-powered Civic Entity builder for Time-Crawl Chronicles, a Vogtcom LLC project.

## Architecture

- Frontend: React, Vite, TypeScript, Tailwind CSS, Cloudflare Pages
- Backend: Cloudflare Worker in `/worker`
- Database: Cloudflare D1
- AI: Anthropic Messages API, called only from the Worker
- Auth: email/password with bcrypt hashes and a signed 30-day JWT in an httpOnly cookie

## What is complete

- Registration, login, logout, session restoration
- Free-tier monthly cap of three successful generations
- Paid-tier district generation and automatic semester persistence
- D1 schema for accounts, entities, flagged outputs, and database-managed blocked terms
- Server-side Anthropic call modeled after `casevoiceai/mystatement/cloudflare/anthropic-worker.js`
- Automatic output scan, retry up to three times, and flagged-attempt logging
- Optional paid-tier community sharing
- Mobile-first UI with a structurally different desktop workspace
- WCAG-oriented contrast and visible keyboard focus states

## Intentional stub

Password-reset email delivery is not implemented. The endpoint returns a clear support message without revealing whether an account exists. To finish it, add a transactional email provider, one-time reset-token storage, expiration, and a reset form.

Paid-tier assignment and billing are also external administrative concerns. New accounts default to `free`; set `accounts.tier = 'paid'` after your billing or school-contract workflow confirms access.

## Local setup

1. Install Node.js 22.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Copy `worker/.dev.vars.example` to `worker/.dev.vars` and fill in both secrets.
5. Create the D1 database:
   `npx wrangler d1 create lantern-archive-db`
6. Put the returned database ID into `worker/wrangler.toml`.
7. Apply migrations:
   `npm run db:migrate:local`
8. Start the Worker:
   `npm run worker:dev`
9. In a second terminal, start the frontend:
   `npm run dev`

## Production setup

### Worker

- Set `APP_ORIGIN` in `worker/wrangler.toml` to the exact Cloudflare Pages origin or custom frontend domain.
- Set `COOKIE_DOMAIN` only when frontend and API use compatible custom subdomains. Leave blank for host-only cookies.
- Add secrets:
  - `npx wrangler secret put ANTHROPIC_API_KEY --config worker/wrangler.toml`
  - `npx wrangler secret put JWT_SECRET --config worker/wrangler.toml`
- Apply remote migrations:
  `npm run db:migrate:remote`
- Deploy:
  `npm run worker:deploy`

### Pages

- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `VITE_API_BASE_URL=https://YOUR-WORKER.workers.dev`

For cross-origin cookie auth, the frontend request uses `credentials: include`, the Worker returns `Access-Control-Allow-Credentials: true`, and `APP_ORIGIN` must exactly match the frontend origin.

## Security notes

- The Anthropic API key and JWT secret are Worker secrets only.
- Passwords are salted bcrypt hashes with cost factor 12.
- Cookies are `HttpOnly`, `Secure`, `SameSite=None`, and expire after 30 days.
- Blocked terms live in D1 and can be expanded without redeploying code.
- No generation is charged when all automatic compliance retries fail.

The blocklist and prompt substantially reduce prohibited terminology, but no finite term list can mathematically guarantee coverage of every proprietary phrase. Operationally, expand the D1 blocklist whenever reviewers discover a missed term.
