/* Анонимная телеметрия пилота. Включается только при заданном адресе API. */
(() => {
  const base = window.WINGO_MONITOR_API;
  if (!base || window.__wingoMonitor) return;
  window.__wingoMonitor = true;
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* WebView без хранилища */ }
  };
  const user = read('wingo:monitor:user', null) || crypto.randomUUID();
  write('wingo:monitor:user', user);
  const game = location.pathname.split('/').filter(Boolean)[0] || 'hub';
  const session = crypto.randomUUID();
  const queueKey = () => `wingo:monitor:queue:${session}:${currentDay}`;
  let coins = [];
  let history = [];
  let rounds = 0;
  let activeMs = 0;
  let previous = performance.now();
  let lastInput = previous;
  let busy = false;
  let again = false;
  let paused = false;
  const day = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
  let currentDay = day();
  const sample = () => {
    const now = performance.now();
    // Ограничиваем интервал: сон устройства и зависание таймера не считаются игрой.
    if (!document.hidden && !paused && now - lastInput < 60000) {
      activeMs += Math.max(0, Math.min(now - previous, 2000));
    }
    previous = now;
  };
  for (const name of ['pointerdown', 'pointermove', 'keydown', 'touchstart']) {
    addEventListener(name, () => { sample(); lastInput = performance.now(); }, { passive: true });
  }
  const snapshot = () => ({
    userId: user, sessionId: session, game, day: currentDay,
    activeMs: Math.round(activeMs), rounds,
    active: !document.hidden && !paused && performance.now() - lastInput < 60000,
    coins: coins.slice(0, 100),
    history: history.slice(0, 100),
  });
  const pending = () => {
    const rows = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('wingo:monitor:queue:')) {
          const value = read(key, null);
          const firstDay = new Date(Date.now() + 5 * 3600000 - 180 * 86400000).toISOString().slice(0, 10);
          if (value && value.day >= firstDay && value.day <= day()) rows.push({ key, value });
          else localStorage.removeItem(key);
        }
      }
    } catch { /* только память */ }
    return rows.slice(0, 20);
  };
  async function send(unloading = false) {
    sample();
    const value = snapshot();
    const currentKey = queueKey();
    write(currentKey, value);
    if (busy && !unloading) { again = true; return; }
    const stored = pending().filter(row => row.key !== currentKey).slice(0, 19);
    const batch = [];
    for (const row of stored) {
      if (JSON.stringify({ sessions: [...batch.map(item => item.value), row.value, value] }).length < 60000) batch.push(row);
    }
    batch.push({ key: currentKey, value });
    const body = JSON.stringify({ sessions: batch.map(row => ({
      ...row.value, active: row.key === currentKey && row.value.active,
    })) });
    if (unloading) {
      // text/plain избегает preflight на выгрузке страницы. Сервер проверяет Origin.
      navigator.sendBeacon?.(`${base}/monitor/collect`, new Blob([body], { type: 'text/plain' }));
      return;
    }
    busy = true;
    let accepted = false;
    try {
      const response = await fetch(`${base}/monitor/collect`, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' }, body,
        signal: AbortSignal.timeout(10000), credentials: 'omit',
      });
      if (response.ok) {
        accepted = true;
        for (const row of batch) {
          // Не стираем более свежий снимок, записанный во время запроса.
          try {
            if (localStorage.getItem(row.key) === JSON.stringify(row.value)) localStorage.removeItem(row.key);
          } catch { /* память */ }
        }
        const acknowledged = new Set(value.coins.map(coin => coin.key));
        coins = coins.filter(coin => !acknowledged.has(coin.key));
        const played = new Set(value.history.map(round => round.roundId));
        history = history.filter(round => !played.has(round.roundId));
      }
    } catch { /* очередь повторяется при восстановлении сети */ }
    finally {
      busy = false;
      const repeat = again && accepted;
      again = false;
      if (repeat) void send();
    }
  }
  addEventListener('wingo:coin-awarded', event => {
    const { key, amount } = event.detail || {};
    if (typeof key === 'string' && Number.isFinite(amount) && amount > 0) {
      coins.push({ key, amount, day: day() });
      // Каждая награда имеет собственную запись: долгий офлайн не раздувает пакет.
      write(`wingo:monitor:queue:${session}:reward:${key}`, {
        ...snapshot(), coins: [coins[coins.length - 1]], active: false,
      });
      void send();
    }
  });
  // Мост дополнительно сообщает событие локально: работает и внутри чужого iframe.
  addEventListener('wingo:bridge-event', event => {
    const data = event.detail;
    if (data?.type === 'GAME_OVER') {
      rounds++;
      const round = {
        roundId: crypto.randomUUID(), day: day(), endedAt: new Date().toISOString(),
        score: Math.max(0, Math.round(Number(data.score) || 0)),
        durationMs: Math.max(0, Math.round(Number(data.durationMs) || 0)),
      };
      history.push(round);
      write(`wingo:monitor:queue:${session}:round:${round.roundId}`, {
        ...snapshot(), history: [round], coins: [], active: false,
      });
      void send();
    }
  });
  addEventListener('message', event => {
    if (event.source !== parent) return;
    if (event.data?.type === 'PAUSE') { sample(); paused = true; void send(); }
    if (event.data?.type === 'RESUME') { paused = false; previous = performance.now(); lastInput = previous; }
  });
  document.addEventListener('visibilitychange', () => {
    previous = performance.now();
    if (!document.hidden) lastInput = previous;
    void send(document.hidden);
  });
  addEventListener('pagehide', () => { void send(true); });
  setInterval(() => {
    sample();
    if (day() !== currentDay) {
      void send();
      currentDay = day(); activeMs = 0; rounds = 0;
    }
  }, 1000);
  setInterval(() => { void send(); }, 15000);
  void send();
})();
