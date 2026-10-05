import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../hub/monitor.js', import.meta.url), 'utf8');
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

function setup({ enabled = true, storage = new Map(), online = true } = {}) {
  const events = new Map();
  const timers = [];
  const sent = [];
  let now = 0;
  let available = online;
  let nextId = 0;
  let calendar = Date.parse('2026-10-05T10:00:00Z');
  class Clock extends Date { static now() { return calendar + now; } }
  const document = { hidden: false, addEventListener: (name, cb) => events.set(name, cb) };
  const window = { WINGO_MONITOR_API: enabled ? 'https://monitor.example' : undefined };
  const parent = {};
  const context = {
    window, parent, document, Date: Clock, Blob,
    location: { pathname: '/soz/' },
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}` },
    localStorage: {
      get length() { return storage.size; },
      key: index => [...storage.keys()][index], getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
    },
    performance: { now: () => now },
    AbortSignal: { timeout: () => null },
    navigator: { sendBeacon: () => true },
    addEventListener: (name, cb) => events.set(name, cb),
    setInterval: (cb, ms) => timers.push({ cb, ms }),
    fetch: async (url, options) => {
      sent.push(JSON.parse(options.body));
      if (!available) throw new Error('offline');
      return { ok: true };
    },
  };
  runInNewContext(source, context);
  return { storage, sent, document, window, parent,
    emit: (name, detail) => events.get(name)?.({ detail }),
    message: data => events.get('message')?.({ source: parent, data }),
    online: value => { available = value; },
    calendar: value => { calendar = value; },
    tick: async ms => {
      const target = now + ms;
      while (now < target) { now += 1000; for (const timer of timers) if (now % timer.ms === 0) timer.cb(); await settle(); }
    },
  };
}

test('disabled monitor sends nothing', async () => {
  const m = setup({ enabled: false }); await m.tick(15000); assert.equal(m.sent.length, 0);
});

test('visible time stops after idle and hidden pages do not count', async () => {
  const m = setup(); await settle(); await m.tick(90000);
  const s = m.sent.at(-1).sessions.at(-1);
  assert.ok(s.activeMs >= 58000 && s.activeMs <= 60000);
  assert.equal(s.active, false);
  m.document.hidden = true; await m.tick(15000);
  assert.equal(m.sent.at(-1).sessions.at(-1).activeMs, s.activeMs);
});

test('iframe local bridge counts rounds and host pause stops time', async () => {
  const m = setup(); await settle();
  m.emit('wingo:bridge-event', { type: 'GAME_OVER', score: 250, durationMs: 30000 }); await settle();
  assert.equal(m.sent.at(-1).sessions.at(-1).rounds, 1);
  assert.equal(m.sent.at(-1).sessions.at(-1).history[0].score, 250);
  assert.equal(m.sent.at(-1).sessions.at(-1).history[0].durationMs, 30000);
  m.message({ type: 'PAUSE' }); await settle(); await m.tick(15000);
  assert.equal(m.sent.at(-1).sessions.at(-1).activeMs, 0);
  m.message({ type: 'RESUME' }); await m.tick(15000);
  assert.equal(m.sent.at(-1).sessions.at(-1).activeMs, 15000);
});

test('offline rewards survive navigation and replay under the original user', async () => {
  const m = setup({ online: false }); await settle();
  m.emit('wingo:coin-awarded', { key: 'soz-daily-123', amount: 25 }); await settle();
  assert.ok([...m.storage.keys()].some(k => k.includes(':reward:')));
  const n = setup({ storage: m.storage }); await settle();
  assert.ok(n.sent[0].sessions.some(s => s.coins.some(c => c.amount === 25)));
  assert.equal(n.sent[0].sessions.at(-1).userId, m.sent[0].sessions[0].userId);
  assert.ok(![...m.storage.keys()].some(k => k.startsWith('wingo:monitor:queue:')));
});

test('midnight uses a separate day snapshot and resets cumulative counters', async () => {
  const m = setup({ online: false }); await settle(); await m.tick(15000);
  m.calendar(Date.parse('2026-10-05T19:00:00Z')); await m.tick(15000);
  const snapshots = [...m.storage.entries()].filter(([key]) => key.startsWith('wingo:monitor:queue:')).map(([, value]) => JSON.parse(value));
  assert.deepEqual([...new Set(snapshots.map(s => s.day))].sort(), ['2026-10-05', '2026-10-06']);
  const second = snapshots.find(s => s.day === '2026-10-06');
  assert.ok(second.activeMs < 15000);
});

test('large offline queue sends bounded batches and does not block current activity', async () => {
  const m = setup({ online: false }); await settle();
  for(let i=0;i<30;i++)m.emit('wingo:coin-awarded',{key:`level-soz-${i}`,amount:25});
  await settle();m.online(true);await m.tick(15000);
  assert.ok(m.sent.every(batch=>batch.sessions.length<=20));
  assert.ok(m.sent.every(batch=>JSON.stringify(batch).length<65536));
  assert.ok(m.sent.at(-1).sessions.at(-1).activeMs>=15000);
});
