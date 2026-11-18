/**
 * Integration test: the real Vercel handler (api/visit.js) + the real @upstash/redis client
 * + our adapters, against a local fake of the Upstash REST API, in MOCK email mode.
 * All non-local network access is blocked, so nothing can reach Resend or Upstash.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startFakeUpstash } from './support/fake-upstash.mjs';

const realFetch = globalThis.fetch;
const outbound = [];
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname !== '127.0.0.1') {
    outbound.push(url.hostname);
    return Promise.reject(new Error(`blocked outbound request to ${url.hostname}`));
  }
  return realFetch(input, init);
};

const mockLines = [];
const origLog = console.log;
console.log = (...args) => {
  const line = args.join(' ');
  if (line.startsWith('[visit:mock-email]')) mockLines.push(line);
};

let upstash;
let POST;

before(async () => {
  upstash = await startFakeUpstash();
  for (const k of Object.keys(process.env)) if (k.startsWith('VISIT_') || k.includes('RESEND') || k.includes('UPSTASH') || k.startsWith('KV_')) delete process.env[k];
  Object.assign(process.env, {
    VISIT_NOTIFY_ENABLED: 'true',
    VISIT_EMAIL_MODE: 'mock',
    VISIT_NOTIFY_TO: 'owner@example.com',
    VISIT_NOTIFY_FROM: 'Portfolio <alerts@notify.example.com>',
    VISIT_HASH_SECRET: 'f'.repeat(64),
    VISIT_MAX_EMAILS_PER_HOUR: '3',
    VISIT_MAX_EMAILS_PER_DAY: '10',
    UPSTASH_REDIS_REST_URL: upstash.url,
    UPSTASH_REDIS_REST_TOKEN: upstash.token,
  });
  ({ POST } = await import(`../api/visit.js?upstash-test=${Date.now()}`));
});

after(async () => {
  console.log = origLog;
  globalThis.fetch = realFetch;
  await upstash.close();
});

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const call = (sid, ip) => POST(new Request('https://www.tahamohyuddin.com/api/visit', {
  method: 'POST',
  headers: {
    'content-type': 'application/json', 'user-agent': UA, origin: 'https://www.tahamohyuddin.com',
    'sec-fetch-site': 'same-origin', 'x-real-ip': ip,
  },
  body: JSON.stringify({ sid: sid.toString(16).padStart(32, '0'), path: '/work/opsrelay', ref: 'linkedin.com' }),
}));

test('mock mode end to end: first visit produces one mock email, duplicates do not', async () => {
  const r1 = await call(1, '198.51.100.10');
  assert.equal(r1.status, 204);
  assert.equal(mockLines.length, 1);
  assert.match(mockLines[0], /New portfolio visit: \/work\/opsrelay via linkedin\.com/);
  await call(1, '198.51.100.10');            // same session
  await call(2, '198.51.100.10');            // new tab, same visitor
  assert.equal(mockLines.length, 1);
});

test('uses Redis transactions and SET NX EX as designed', () => {
  const names = upstash.commands.map((c) => c[0]);
  assert.ok(names.includes('INCR') && names.includes('EXPIRE') && names.includes('SET'));
  const set = upstash.commands.find((c) => c[0] === 'SET');
  assert.deepEqual(set.slice(3).map((s) => s.toUpperCase()), ['NX', 'EX', '1800']);
});

test('hourly cap: extra visitors are counted and one pause notice is sent', async () => {
  for (let i = 0; i < 6; i++) await call(100 + i, `192.0.2.${i}`);
  const visits = mockLines.filter((l) => l.includes('New portfolio visit'));
  const paused = mockLines.filter((l) => l.includes('paused'));
  assert.equal(visits.length, 3);              // hourly cap = 3
  assert.equal(paused.length, 1);
});

test('per-IP rate limit returns 429 through the real handler', async () => {
  let last;
  for (let i = 0; i < 22; i++) last = await call(500 + i, '203.0.113.50');
  assert.equal(last.status, 429);
});

test('no raw IP addresses are stored in Redis', () => {
  const dump = JSON.stringify([...upstash.data.entries()]);
  for (const ip of ['198.51.100.10', '192.0.2.1', '203.0.113.50']) assert.ok(!dump.includes(ip), ip);
});

test('no request left the machine (nothing reached Resend or Upstash cloud)', () => {
  assert.deepEqual(outbound, []);
});

test('wrong Redis token fails closed without leaking details', async () => {
  process.env.UPSTASH_REDIS_REST_TOKEN = 'wrong';
  const { POST: badPost } = await import(`../api/visit.js?bad-token=${Date.now()}`);
  const before = mockLines.length;
  const r = await badPost(new Request('https://www.tahamohyuddin.com/api/visit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': UA, 'x-real-ip': '198.51.100.99' },
    body: JSON.stringify({ sid: 'a'.repeat(32), path: '/' }),
  }));
  assert.equal(r.status, 204);
  assert.equal(await r.text(), '');
  assert.equal(mockLines.length, before);
});
