import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleVisit, readConfig, validatePayload, LIMITS } from '../lib/visit/core.mjs';
import { memoryStore, mockMailer } from '../lib/visit/adapters.mjs';
import { escapeHtml, renderVisitEmail } from '../lib/visit/email.mjs';

const ENV = {
  VISIT_NOTIFY_ENABLED: 'true',
  VISIT_EMAIL_MODE: 'mock',
  VISIT_NOTIFY_TO: 'owner@example.com',
  VISIT_NOTIFY_FROM: 'Portfolio <alerts@notify.example.com>',
  VISIT_HASH_SECRET: 'x'.repeat(64),
  VISIT_MAX_EMAILS_PER_HOUR: '3',
  VISIT_MAX_EMAILS_PER_DAY: '5',
};
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const sid = (n) => n.toString(16).padStart(32, '0');

function setup(envOverrides = {}, startMs = Date.parse('2026-11-18T15:00:00Z')) {
  let t = startMs;
  const clock = () => t;
  const { cfg, problems } = readConfig({ ...ENV, ...envOverrides });
  const store = memoryStore(clock);
  const sent = [];
  const logs = [];
  const deps = {
    cfg, problems, store,
    mailer: mockMailer(sent),
    now: () => new Date(t),
    log: (event, detail) => logs.push({ event, ...detail }),
  };
  return { deps, store, sent, logs, advance: (ms) => { t += ms; } };
}

function req({ body, ip = '203.0.113.7', ua = UA, type = 'application/json', origin = 'https://www.tahamohyuddin.com', site = 'same-origin', method = 'POST' } = {}) {
  const headers = new Headers();
  if (type) headers.set('content-type', type);
  if (ua) headers.set('user-agent', ua);
  if (origin) headers.set('origin', origin);
  if (site) headers.set('sec-fetch-site', site);
  if (ip) headers.set('x-real-ip', ip);
  return { method, headers, bodyText: typeof body === 'string' ? body : JSON.stringify(body) };
}

const visit = (n, extra = {}) => req({ body: { sid: sid(n), path: '/work', ref: 'linkedin.com' }, ...extra });

// Silence the mock mailer's console line during tests.
console.log = () => {};

test('sends one email for a new session, with page, referrer domain and timestamp', async () => {
  const { deps, sent } = setup();
  const r = await handleVisit(visit(1), deps);
  assert.equal(r.status, 204);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'owner@example.com');
  assert.match(sent[0].subject, /New portfolio visit: \/work via linkedin\.com/);
  assert.match(sent[0].text, /First page: \/work/);
  assert.match(sent[0].text, /Came from: linkedin\.com/);
  assert.match(sent[0].text, /Time: .*2026/);
  assert.match(sent[0].text, /Device: Computer/);
});

test('is a no-op when disabled by the server-side switch', async () => {
  const { deps, sent, store } = setup({ VISIT_NOTIFY_ENABLED: 'false' });
  assert.equal((await handleVisit(visit(1), deps)).status, 204);
  assert.equal(sent.length, 0);
  assert.equal(store.data.size, 0);
});

test('incomplete configuration fails closed and logs variable names only', async () => {
  const { deps, sent, logs } = setup({ VISIT_HASH_SECRET: 'short', VISIT_NOTIFY_TO: '' });
  assert.equal((await handleVisit(visit(1), deps)).status, 204);
  assert.equal(sent.length, 0);
  assert.deepEqual(logs[0].missing.sort(), ['VISIT_HASH_SECRET', 'VISIT_NOTIFY_TO']);
  assert.ok(!JSON.stringify(logs).includes('short'));
});

test('send mode requires a Resend key', () => {
  const { problems } = readConfig({ ...ENV, VISIT_EMAIL_MODE: 'send' });
  assert.deepEqual(problems, ['RESEND_API_KEY']);
});

test('deduplicates repeated beacons from the same session', async () => {
  const { deps, sent } = setup();
  for (let i = 0; i < 5; i++) await handleVisit(visit(1, { ip: `198.51.100.${i}` }), deps);
  assert.equal(sent.length, 1);
});

test('one email per visitor IP per window, even with rotating session IDs', async () => {
  const { deps, sent, advance } = setup();
  for (let i = 0; i < 6; i++) await handleVisit(visit(100 + i), deps);
  assert.equal(sent.length, 1);
  advance((LIMITS.ipNotifyTtl + 1) * 1000);
  await handleVisit(visit(200), deps);
  assert.equal(sent.length, 2);
});

test('per-IP request rate limit returns 429', async () => {
  const { deps } = setup();
  let last;
  for (let i = 0; i <= LIMITS.ipRequestsPerHour; i++) last = await handleVisit(visit(300 + i), deps);
  assert.equal(last.status, 429);
});

test('global caps suppress emails, send a single pause notice, and report the count later', async () => {
  const { deps, sent, advance } = setup();
  // 10 distinct visitors in one hour; hourly cap is 3.
  for (let i = 0; i < 10; i++) await handleVisit(visit(400 + i, { ip: `192.0.2.${i}` }), deps);
  const visits = sent.filter((m) => m.subject.startsWith('New portfolio visit'));
  const notices = sent.filter((m) => m.subject.includes('paused'));
  assert.equal(visits.length, 3);
  assert.equal(notices.length, 1);

  advance(61 * 60 * 1000);   // next hour: daily cap (5) still has room
  await handleVisit(visit(500, { ip: '192.0.2.200' }), deps);
  const next = sent.at(-1);
  assert.match(next.text, /Also today: 7 more visits while alerts were paused/);
});

test('daily cap bounds the total even across many hours', async () => {
  const { deps, sent, advance } = setup();
  let n = 0;
  for (let h = 0; h < 8; h++) {
    for (let i = 0; i < 5; i++) await handleVisit(visit(1000 + n++, { ip: `10.0.${h}.${i}` }), deps);
    advance(60 * 60 * 1000);
  }
  // Each window resets per UTC day; 15:00Z + 8h stays within one day: max 5 visits + 1 notice.
  assert.ok(sent.length <= 6, `sent ${sent.length}`);
});

test('ignores known bots and empty user agents without sending', async () => {
  const { deps, sent } = setup();
  for (const ua of ['Googlebot/2.1', 'curl/8.4.0', 'HeadlessChrome/130', '']) {
    const r = await handleVisit(visit(600 + ua.length, { ua }), deps);
    assert.equal(r.status, 204);
  }
  assert.equal(sent.length, 0);
});

test('rejects cross-site origins and fetch metadata', async () => {
  const { deps, sent } = setup();
  assert.equal((await handleVisit(visit(1, { origin: 'https://evil.example' }), deps)).status, 403);
  assert.equal((await handleVisit(visit(2, { site: 'cross-site' }), deps)).status, 403);
  assert.equal(sent.length, 0);
});

test('rejects malformed requests', async () => {
  const { deps } = setup();
  assert.equal((await handleVisit(req({ method: 'GET', body: {} }), deps)).status, 405);
  assert.equal((await handleVisit(req({ body: 'not json' }), deps)).status, 400);
  assert.equal((await handleVisit(req({ type: 'text/plain', body: { sid: sid(1), path: '/' } }), deps)).status, 415);
  assert.equal((await handleVisit(req({ body: { sid: 'x'.repeat(2000), path: '/' } }), deps)).status, 413);
  assert.equal((await handleVisit(req({ body: { sid: 'nope', path: '/' } }), deps)).status, 400);
  assert.equal((await handleVisit(req({ body: { sid: sid(1), path: 'https://evil.example' } }), deps)).status, 400);
  assert.equal((await handleVisit(req({ body: { sid: sid(1), path: '/<script>' } }), deps)).status, 400);
  assert.equal((await handleVisit(req({ body: { sid: sid(1), path: '/', ref: 'a b<c>' } }), deps)).status, 400);
});

test('visitor cannot choose the recipient or inject extra fields', async () => {
  const { deps, sent } = setup();
  await handleVisit(req({ body: { sid: sid(9), path: '/', to: 'attacker@example.com', from: 'x@y.z' } }), deps);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'owner@example.com');
  assert.equal(sent[0].from, 'Portfolio <alerts@notify.example.com>');
});

test('never stores or emails the raw IP address', async () => {
  const { deps, sent, store } = setup();
  await handleVisit(visit(1, { ip: '203.0.113.99' }), deps);
  const keys = [...store.data.keys()].join(' ');
  assert.ok(!keys.includes('203.0.113.99'));
  assert.ok(!JSON.stringify(sent).includes('203.0.113.99'));
});

test('store failures fail closed with a generic response', async () => {
  const { deps, sent, logs } = setup();
  deps.store = { incrWithTtl: async () => { throw new Error('ECONNREFUSED redis://secret@host'); } };
  const r = await handleVisit(visit(1), deps);
  assert.equal(r.status, 204);
  assert.equal(r.body, null);
  assert.equal(sent.length, 0);
  assert.ok(!JSON.stringify(logs).includes('secret'));
});

test('email provider failure is logged without details and not exposed', async () => {
  const { deps, logs } = setup();
  deps.mailer = { send: async () => { throw new Error('401 invalid key re_abc123'); } };
  const r = await handleVisit(visit(1), deps);
  assert.equal(r.status, 204);
  assert.ok(logs.some((l) => l.event === 'visit.email_error'));
  assert.ok(!JSON.stringify(logs).includes('re_abc123'));
});

test('email HTML escapes every dynamic value', () => {
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>&"\''), '&lt;img src=x onerror=alert(1)&gt;&amp;&quot;&#39;');
  const e = renderVisitEmail({ now: new Date(), timeZone: 'America/Toronto', path: '/work', referrer: 'a.example', device: 'Phone', suppressed: 0 });
  assert.ok(!e.html.includes('<script'));
  assert.ok(e.html.includes('a.example'));
});

test('payload validation normalises the referrer to a lowercase host', () => {
  assert.deepEqual(validatePayload({ sid: sid(1), path: '/work/opsrelay', ref: 'News.YCombinator.com' }),
    { sid: sid(1), path: '/work/opsrelay', referrer: 'news.ycombinator.com' });
  assert.equal(validatePayload({ sid: sid(1), path: '/../etc' }), null);
  assert.equal(validatePayload([]), null);
});
