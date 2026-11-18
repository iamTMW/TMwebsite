/**
 * POST /api/visit: one email per genuine new visitor session.
 * Vercel Node.js function (Web Request/Response signature). Server-only: the Resend key,
 * Redis token and hash secret are read from environment variables and never reach the browser.
 * Only POST is exported, so other methods get 405 from the platform.
 */
import { Redis } from '@upstash/redis';
import { Resend } from 'resend';
import { LIMITS, handleVisit, readConfig } from '../lib/visit/core.mjs';
import { mockMailer, resendMailer, upstashStore } from '../lib/visit/adapters.mjs';

let deps;   // reused across warm invocations

function getDeps() {
  if (deps) return deps;
  const { cfg, problems } = readConfig(process.env);
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (cfg.enabled && (!url || !token)) problems.push('UPSTASH_REDIS_REST_URL/TOKEN');
  deps = {
    cfg,
    problems,
    store: url && token ? upstashStore(new Redis({ url, token })) : null,
    mailer: cfg.mode === 'mock' || !process.env.RESEND_API_KEY
      ? mockMailer()
      : resendMailer(new Resend(process.env.RESEND_API_KEY)),
    log: (event, detail) => console.log(JSON.stringify({ event, ...detail })),
  };
  return deps;
}

export async function POST(request) {
  let result;
  try {
    // Refuse oversized bodies before reading them fully when the length is declared.
    // (Vercel also caps request bodies at 4.5 MB; the core rejects anything over 1 KB.)
    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > LIMITS.maxBodyBytes) {
      result = { status: 413, body: { ok: false } };
    } else {
      const bodyText = await request.text();
      result = await handleVisit({ method: 'POST', headers: request.headers, bodyText }, getDeps());
    }
  } catch (err) {
    console.log(JSON.stringify({ event: 'visit.unhandled', name: err && err.name }));
    result = { status: 204, body: null };
  }
  const headers = { 'Cache-Control': 'no-store' };
  if (result.body === null) return new Response(null, { status: result.status, headers });
  return Response.json(result.body, { status: result.status, headers });
}
