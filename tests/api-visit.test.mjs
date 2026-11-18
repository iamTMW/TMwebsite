import { test } from 'node:test';
import assert from 'node:assert/strict';

// No credentials in the environment: the handler must stay quiet and never throw.
for (const k of Object.keys(process.env)) if (k.startsWith('VISIT_') || k.includes('RESEND') || k.includes('UPSTASH') || k.startsWith('KV_')) delete process.env[k];

const mod = await import('../api/visit.js');

test('only POST is exported (platform answers other methods with 405)', () => {
  assert.equal(typeof mod.POST, 'function');
  assert.equal(mod.GET, undefined);
});

test('disabled by default: 204, no body, no-store', async () => {
  const r = await mod.POST(new Request('https://www.tahamohyuddin.com/api/visit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sid: '0'.repeat(32), path: '/' }),
  }));
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(await r.text(), '');
});

test('declared oversized bodies are rejected before reading', async () => {
  const r = await mod.POST(new Request('https://www.tahamohyuddin.com/api/visit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': '50000' },
    body: 'x'.repeat(50000),
  }));
  assert.equal(r.status, 413);
  assert.deepEqual(await r.json(), { ok: false });
});
