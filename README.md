# tahamohyuddin.com

Personal portfolio for Taha Mohyuddin. It's a hand-written static site (HTML, CSS, vanilla JS) with a
zero-dependency build step and one serverless endpoint, deployed on Vercel.

```
src/pages/*.html     page bodies, each starting with a <!--page {...}--> header (title, description, route)
src/partials/        shared head, header, footer, and the OpsRelay pipeline diagram (SVG)
src/assets/          styles.css, app.js, theme.js (fingerprinted into dist/assets/ at build)
images/opt/, og/     optimised WebP images and social cards (the only images that get deployed)
fonts/               self-hosted Fraunces and Inter Tight (OFL)
api/visit.js         POST /api/visit: visit email notifications (Vercel Node function)
lib/visit/           endpoint logic, email templates, Redis/Resend adapters (server-only)
scripts/build.mjs    builds dist/: wraps pages, copies only referenced images, writes sitemap and robots
tests/               node:test suite for the visit endpoint (mocked storage and email)
```

## Local development

Requires Node 20+ and Python 3.

```bash
npm ci
npm run preview            # builds dist/ and serves it at http://127.0.0.1:8000 with Vercel-style routes
npm run check              # syntax, build, static site checks, endpoint tests
npm run smoke              # Playwright behaviour tests (needs: pip install playwright && playwright install chromium)
npm run layout             # rendered-layout audit: every route at 320-1920px in light and dark
```

Edit files in `src/`, never in `dist/` (it's generated and git-ignored). To add a page, create
`src/pages/name.html` with a page header. Its `path` sets the URL.

Images: put the original in `images/`, add it to `scripts/optimize_images.py`, run it (needs Pillow), and
reference `/images/opt/<name>.webp`. The build fails if a page references a missing image.

## Visit email notifications

When a new browser session opens the site, you get an email showing the time, the first page, the
referring domain and the device class (phone, tablet or computer).

**How it works**

1. `app.js` (production domain only) waits until the page has been visible for 2.5 s, then sends one
   beacon per tab session: `{ sid, path, ref }`. It's skipped for Global Privacy Control, Do Not Track
   and automated browsers.
2. `api/visit.js` checks, in order: kill switch, JSON content type, 1 KB body limit, strict schema,
   Origin / `Sec-Fetch-Site`, bot user agents, a per-IP limit (20/hour), session dedupe (30 min),
   per-visitor dedupe (30 min), then a **global cap** (default 6/hour, 30/day).
3. Over the cap, visits are counted rather than emailed. You get one "alerts paused" notice per day, and the
   suppressed count appears in the next alert. The worst case is `MAX_PER_DAY + 1` emails per day,
   whatever the traffic.
4. All counters live in Upstash Redis, so limits hold across serverless instances. IPs are only
   used as `HMAC-SHA256(secret, day|ip)` in keys that expire within 26 hours. Raw IPs and full user agents
   are never stored or emailed. Any storage or email error fails closed, with a generic 204 response.

None of the header checks is treated as a security boundary on its own. The shared global cap bounds
the cost even if a client forges every header.

**Environment variables** (Vercel > Project > Settings > Environment Variables, Production only, all
server-side; see `.env.example`):

| Variable | Required | Purpose |
| --- | --- | --- |
| `VISIT_NOTIFY_ENABLED` | yes | `true` turns alerts on. Anything else turns them off (the kill switch). |
| `VISIT_EMAIL_MODE` | no | `send` (default) or `mock` (logs the subject line, sends nothing) |
| `VISIT_NOTIFY_TO` | yes | Fixed recipient, e.g. `tahamohyuddin30@gmail.com` |
| `VISIT_NOTIFY_FROM` | yes | Sender on a Resend-verified domain, e.g. `Portfolio <alerts@notify.tahamohyuddin.com>` |
| `RESEND_API_KEY` | yes (send mode) | Resend key with **sending access only**, restricted to that domain |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | yes | Upstash Redis REST credentials (`KV_REST_API_URL` / `KV_REST_API_TOKEN` also work) |
| `VISIT_HASH_SECRET` | yes | 32+ random characters: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `VISIT_MAX_EMAILS_PER_HOUR` / `_PER_DAY` | no | Defaults 6 / 30 |
| `VISIT_ALLOWED_HOSTS` | no | Default `www.tahamohyuddin.com,tahamohyuddin.com` |
| `VISIT_TIME_ZONE` | no | Default `America/Toronto` |

If anything required is missing, the endpoint logs the **names** of the missing variables and sends nothing.

**One-time setup (manual)**

1. **Resend:** create an account and add a sending domain. A subdomain such as `notify.tahamohyuddin.com`
   keeps your root domain's email reputation separate. Add the SPF, DKIM and (recommended) DMARC DNS records
   Resend shows you, wait for "Verified", then create an API key with *Sending access* for that domain.
2. **Upstash Redis:** create a database (Vercel > Storage > Marketplace > Upstash, or upstash.com) in a
   region near your Vercel functions (e.g. `us-east-1`). Copy the REST URL and token.
3. Add the variables above in Vercel (Production). Start with `VISIT_EMAIL_MODE=mock`, deploy, open the
   site in a private window, and check the function logs for `[visit:mock-email]`.
4. Switch to `VISIT_EMAIL_MODE=send` and redeploy. To turn alerts off, set `VISIT_NOTIFY_ENABLED=false`.
5. Optional: enable **Web Analytics** in the Vercel project. The script loads only on the production domain.

## Contact form

The contact form is separate from visit notifications. It posts to FormSubmit's AJAX endpoint, with
client-side validation, length limits, a honeypot field, and a mailto fallback message on failure. FormSubmit
needs a one-time activation email the first time it receives a submission. After that, you can replace the
email address in the form's `action` URL with the random alias FormSubmit gives you, so the address isn't in
the page source (it's still shown on the page deliberately).

## Security

- **Headers** (`vercel.json`): strict CSP (`script-src 'self'`, no inline scripts, `frame-ancestors 'none'`,
  `connect-src` limited to self and FormSubmit), HSTS, `nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, Permissions-Policy, COOP. `/api/*` is `no-store` and `noindex`.
- **No secrets in the browser:** `dist/` is checked by `scripts/verify_site.py` for key-like strings and
  `.env` files. Server code lives in `api/` and `lib/`, which are never copied to `dist/`. `.env*` is git-ignored.
- **Only referenced assets ship.** Old files in `images/` (PDFs, saved pages, videos) are no longer deployed.
- `/api/visit` sets no CORS headers, so it's same-origin only. It's POST-only and schema-validated.
- `npm audit --omit=dev` runs in CI.

## Deployment checklist

1. `npm ci && npm run check && npm run smoke && npm run layout`. Everything should pass.
2. Passing checks are not enough: look through `test-screenshots/review/` (every route, 7 widths, both themes).
3. Push the branch and open a PR. Wait for the **Portfolio quality checks** workflow to pass.
4. Open the Vercel **Preview** deployment and click through every page in both themes, on your phone too.
5. In the preview, confirm the response headers (`curl -sI <preview-url>`) and that `/resume`,
   `/portfolio`, `/blog` and `/services` redirect correctly.
6. Add the environment variables (start with `VISIT_EMAIL_MODE=mock`), then merge to `main`.
7. After production deploys, open the site once in a private window and confirm the mock log line, then
   switch to `send`.
8. Send yourself one contact-form message from production.

## Rollback

- **Fastest:** Vercel dashboard > Deployments > choose the previous production deployment > **Promote to Production**
  (or `vercel rollback`). This is instant and needs no code change.
- **Turn off emails only:** set `VISIT_NOTIFY_ENABLED=false` and redeploy.
- **In git:** the pre-upgrade state is tagged `checkpoint/pre-portfolio-upgrade-2026-11-18`. Revert the merge
  commit on `main` (`git revert -m 1 <merge-sha>`) rather than force-pushing.

## Known limitations

- The visit beacon is best-effort. Ad blockers or very short visits may not trigger it. Bot filtering is
  heuristic: a determined script can still produce alerts, but only up to the global cap.
- `style-src` allows `'unsafe-inline'` because pages use some inline `style` attributes. Scripts are fully restricted.
- The OpsRelay dashboard requires sign-in, so the case study uses an architecture diagram drawn from the repo
  documentation rather than dashboard screenshots. Real screenshots can be added to `images/` and swapped in.
