/**
 * Visit notification core. Pure logic: storage, mailer, clock and config are injected,
 * so the same code runs on Vercel (Upstash + Resend) and in tests (memory + mock).
 *
 * Abuse controls, in order:
 *   kill switch -> request shape (method, type, size, schema) -> Origin / Sec-Fetch-Site
 *   -> bot user agents -> per-IP rate limit -> per-session dedupe -> per-IP notify dedupe
 *   -> global hourly and daily email caps (excess is counted, not sent).
 * None of these is trusted on its own; the shared caps bound the worst case even if a
 * client forges every header. Raw IPs are never stored or emailed: only an HMAC of
 * (day, IP) with a server-side secret, in keys that expire within a day.
 */
import { createHmac } from 'node:crypto';
import { renderVisitEmail, renderCapEmail } from './email.mjs';

export const LIMITS = Object.freeze({
  maxBodyBytes: 1024,
  ipRequestsPerHour: 20,
  sessionTtl: 30 * 60,        // one email per session ID per 30 minutes
  ipNotifyTtl: 30 * 60,       // and one per visitor IP per 30 minutes
});

const BOT_UA = /bot|crawl|spider|slurp|preview|fetch|monitor|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|curl|wget|python-requests|httpx|axios|node-fetch|go-http|java\/|okhttp|libwww|scrapy|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|linkedinbot|vercel-screenshot/i;

const SID = /^[a-f0-9]{32}$/;
const HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)+$/;
const PATH = /^\/[A-Za-z0-9/_.-]{0,199}$/;

/** Read and validate configuration from environment variables. Never returns secrets in errors. */
export function readConfig(env) {
  const enabled = String(env.VISIT_NOTIFY_ENABLED || '').toLowerCase() === 'true';
  const mode = env.VISIT_EMAIL_MODE === 'mock' ? 'mock' : 'send';
  const cfg = {
    enabled,
    mode,
    to: (env.VISIT_NOTIFY_TO || '').trim(),
    from: (env.VISIT_NOTIFY_FROM || '').trim(),
    hashSecret: env.VISIT_HASH_SECRET || '',
    maxPerHour: clampInt(env.VISIT_MAX_EMAILS_PER_HOUR, 6, 1, 60),
    maxPerDay: clampInt(env.VISIT_MAX_EMAILS_PER_DAY, 30, 1, 500),
    allowedHosts: (env.VISIT_ALLOWED_HOSTS || 'www.tahamohyuddin.com,tahamohyuddin.com')
      .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean),
    timeZone: env.VISIT_TIME_ZONE || 'America/Toronto',
  };
  const problems = [];
  if (enabled) {
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(cfg.to)) problems.push('VISIT_NOTIFY_TO');
    if (!/@[^\s@<>]+\.[^\s@<>]+>?$/.test(cfg.from)) problems.push('VISIT_NOTIFY_FROM');
    if (cfg.hashSecret.length < 32) problems.push('VISIT_HASH_SECRET');
    if (mode === 'send' && !env.RESEND_API_KEY) problems.push('RESEND_API_KEY');
  }
  return { cfg, problems };
}

function clampInt(v, dflt, min, max) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
}

/** Coarse device class only; the full user agent is never stored or emailed. */
export function deviceClass(ua) {
  if (/iPad|Tablet/i.test(ua)) return 'Tablet';
  if (/Mobi|Android|iPhone/i.test(ua)) return 'Phone';
  return 'Computer';
}

export function clientIp(headers) {
  // On Vercel, x-real-ip / x-forwarded-for are set by the platform edge, not the client.
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return 'unknown';
}

function hostAllowed(value, allowed) {
  if (!value) return true;            // absent header: rely on the other controls
  try {
    return allowed.includes(new URL(value).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function validatePayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { sid, path, ref } = raw;
  if (typeof sid !== 'string' || !SID.test(sid)) return null;
  if (typeof path !== 'string' || !PATH.test(path) || path.includes('..')) return null;
  let referrer = '';
  if (ref !== undefined && ref !== '') {
    if (typeof ref !== 'string') return null;
    const host = ref.toLowerCase();
    if (!HOST.test(host)) return null;
    referrer = host;
  }
  return { sid, path, referrer };
}

const res = (status, body) => ({ status, body });
const QUIET = res(204, null);

/**
 * @param {{ method: string, headers: Headers, bodyText: string }} req
 * @param {{ cfg: object, problems: string[], store: object, mailer: object, now?: () => Date, log?: Function }} deps
 */
export async function handleVisit(req, deps) {
  const { cfg, problems, store, mailer } = deps;
  const now = deps.now ? deps.now() : new Date();
  const log = deps.log || (() => {});

  if (req.method !== 'POST') return res(405, { ok: false });
  if (!cfg.enabled) return QUIET;
  if (problems.length) {
    log('visit.config_incomplete', { missing: problems });   // names only, never values
    return QUIET;
  }

  const type = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return res(415, { ok: false });
  if (Buffer.byteLength(req.bodyText || '', 'utf8') > LIMITS.maxBodyBytes) return res(413, { ok: false });

  let payload;
  try {
    payload = validatePayload(JSON.parse(req.bodyText));
  } catch {
    payload = null;
  }
  if (!payload) return res(400, { ok: false });

  if (!hostAllowed(req.headers.get('origin'), cfg.allowedHosts)) return res(403, { ok: false });
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return res(403, { ok: false });

  const ua = req.headers.get('user-agent') || '';
  if (!ua || BOT_UA.test(ua)) return QUIET;

  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  const hour = now.toISOString().slice(0, 13).replace(/[-T]/g, '');
  const ipHash = createHmac('sha256', cfg.hashSecret)
    .update(`${day}|${clientIp(req.headers)}`).digest('hex').slice(0, 32);

  try {
    const hits = await store.incrWithTtl(`v:rl:${ipHash}`, 3600);
    if (hits > LIMITS.ipRequestsPerHour) return res(429, { ok: false });

    if (!(await store.setNx(`v:sid:${payload.sid}`, LIMITS.sessionTtl))) return QUIET;
    if (!(await store.setNx(`v:ipn:${ipHash}`, LIMITS.ipNotifyTtl))) return QUIET;

    // The daily counter only advances when the hourly check passes, so it tracks emails
    // actually sent (plus at most the attempts after the day's cap is already reached).
    const perHour = await store.incrWithTtl(`v:cap:h:${hour}`, 2 * 3600);
    const overCap = perHour > cfg.maxPerHour
      || (await store.incrWithTtl(`v:cap:d:${day}`, 26 * 3600)) > cfg.maxPerDay;

    if (overCap) {
      await store.incrWithTtl(`v:sup:${day}`, 26 * 3600);
      // At most one "alerts paused" notice per day, so the worst case is maxPerDay + 1 emails.
      if (await store.setNx(`v:capnote:${day}`, 26 * 3600)) {
        await deliver(mailer, cfg, renderCapEmail({ now, timeZone: cfg.timeZone, perHour: cfg.maxPerHour, perDay: cfg.maxPerDay }), log);
      }
      return QUIET;
    }

    const suppressed = (await store.getDel(`v:sup:${day}`)) || 0;
    const email = renderVisitEmail({
      now,
      timeZone: cfg.timeZone,
      path: payload.path,
      referrer: payload.referrer,
      device: deviceClass(ua),
      suppressed,
    });
    await deliver(mailer, cfg, email, log);
  } catch (err) {
    // Fail closed: no email, generic response, no internal detail to the client.
    log('visit.store_error', { name: err && err.name });
    return QUIET;
  }
  return QUIET;
}

async function deliver(mailer, cfg, email, log) {
  try {
    await mailer.send({ from: cfg.from, to: cfg.to, ...email });
    log('visit.email_sent', { subject: email.subject });
  } catch (err) {
    log('visit.email_error', { name: err && err.name });
  }
}
