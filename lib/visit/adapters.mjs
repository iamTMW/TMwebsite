/**
 * Storage and mailer adapters.
 *   - Upstash Redis (shared across serverless instances) for production.
 *   - In-memory store and console mailer for tests and local runs ONLY: an in-memory
 *     limiter is per-instance and would not hold under serverless concurrency.
 */

export function upstashStore(redis) {
  return {
    async incrWithTtl(key, ttl) {
      const [count] = await redis.multi().incr(key).expire(key, ttl).exec();
      return Number(count);
    },
    async setNx(key, ttl) {
      return (await redis.set(key, '1', { nx: true, ex: ttl })) === 'OK';
    },
    async getDel(key) {
      const v = await redis.getdel(key);
      return v == null ? null : Number(v);
    },
  };
}

export function memoryStore(clock = () => Date.now()) {
  const data = new Map();
  const live = (key) => {
    const e = data.get(key);
    if (e && e.exp <= clock()) { data.delete(key); return undefined; }
    return e;
  };
  return {
    data,
    async incrWithTtl(key, ttl) {
      const e = live(key);
      const value = (e ? Number(e.value) : 0) + 1;
      data.set(key, { value, exp: clock() + ttl * 1000 });
      return value;
    },
    async setNx(key, ttl) {
      if (live(key)) return false;
      data.set(key, { value: '1', exp: clock() + ttl * 1000 });
      return true;
    },
    async getDel(key) {
      const e = live(key);
      data.delete(key);
      return e ? Number(e.value) : null;
    },
  };
}

export function resendMailer(resend) {
  return {
    async send({ from, to, subject, html, text }) {
      const { error } = await resend.emails.send({ from, to: [to], subject, html, text });
      if (error) {
        const e = new Error('Email provider rejected the message');
        e.name = `ResendError:${error.name || 'unknown'}`;
        throw e;
      }
    },
  };
}

export function mockMailer(sink = []) {
  return {
    sent: sink,
    async send(msg) {
      sink.push(msg);
      // Local visibility without sending anything. No recipient address in logs.
      console.log(`[visit:mock-email] ${msg.subject}`);
    },
  };
}
