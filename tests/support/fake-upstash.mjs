/**
 * Minimal local stand-in for the Upstash Redis REST API, for tests only.
 * Implements just the commands the visit endpoint uses (INCR, EXPIRE, SET NX EX, GETDEL, GET)
 * for single commands, /pipeline and /multi-exec, and requires the bearer token.
 */
import http from 'node:http';

export async function startFakeUpstash({ token = 'local-test-token' } = {}) {
  const data = new Map();          // key -> { value, exp }
  const commands = [];
  const now = () => Date.now();
  const live = (k) => {
    const e = data.get(k);
    if (e && e.exp && e.exp <= now()) { data.delete(k); return undefined; }
    return e;
  };

  function run(cmd) {
    const [name, ...args] = cmd.map(String);
    commands.push([name.toUpperCase(), ...args]);
    switch (name.toUpperCase()) {
      case 'INCR': {
        const e = live(args[0]);
        const v = (e ? Number(e.value) : 0) + 1;
        data.set(args[0], { value: String(v), exp: e ? e.exp : 0 });
        return v;
      }
      case 'EXPIRE': {
        const e = live(args[0]);
        if (!e) return 0;
        e.exp = now() + Number(args[1]) * 1000;
        return 1;
      }
      case 'SET': {
        const [key, value, ...opts] = args;
        const up = opts.map((o) => o.toUpperCase());
        if (up.includes('NX') && live(key)) return null;
        const exIdx = up.indexOf('EX');
        data.set(key, { value, exp: exIdx >= 0 ? now() + Number(opts[exIdx + 1]) * 1000 : 0 });
        return 'OK';
      }
      case 'GET': { const e = live(args[0]); return e ? e.value : null; }
      case 'GETDEL': { const e = live(args[0]); data.delete(args[0]); return e ? e.value : null; }
      case 'PING': return 'PONG';
      default: throw new Error(`ERR unknown command '${name}'`);
    }
  }

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(401, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
      }
      const b64 = req.headers['upstash-encoding'] === 'base64';
      const enc = (v) => (b64 && typeof v === 'string' ? Buffer.from(v).toString('base64') : v);
      const wrap = (cmd) => { try { return { result: enc(run(cmd)) }; } catch (e) { return { error: e.message }; } };
      const parsed = JSON.parse(body || '[]');
      const path = req.url.split('?')[0];
      const out = path === '/pipeline' || path === '/multi-exec' ? parsed.map(wrap) : wrap(parsed);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    token,
    data,
    commands,
    close: () => new Promise((r) => server.close(r)),
  };
}
