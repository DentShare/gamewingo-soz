/** Изолированный пилот феникса. Без явной конфигурации ничего не делает. */
(() => {
  const testMode = Boolean(window.WINGO_PET_TEST_API);
  const api = window.WINGO_PET_TEST_API || window.WINGO_PET_PILOT_API;
  if (!api) return;
  const key = 'wingo:phoenix:pilot-user:v1';
  const tokenKey = 'wingo:phoenix:test-token:v1';
  let user = null;
  let token = null;
  if (testMode) {
    try { token = sessionStorage.getItem(tokenKey); } catch { /* Private storage disabled. */ }
  } else {
    try {
      user = localStorage.getItem(key);
      if (!user || !/^[0-9a-f-]{36}$/i.test(user)) {
        user = crypto.randomUUID();
        localStorage.setItem(key, user);
      }
    } catch {
      user = crypto.randomUUID();
    }
  }

  let state = null;
  let status = testMode && !token ? 'needs_token' : 'connecting';
  let roundId = null;
  let requestSerial = 0;
  let appliedSerial = 0;
  const changed = () => window.dispatchEvent(new CustomEvent('wingo:pet-state'));

  async function request(path, init) {
    if (testMode && !token) {
      status = 'needs_token';
      changed();
      throw new Error('Phoenix test token required');
    }
    const serial = ++requestSerial;
    try {
      const headers = testMode
        ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
        : { 'Content-Type': 'application/json', 'X-Pet-Test-User': user };
      const response = await fetch(api + path, { ...init, headers });
      if (testMode && response.status === 401) {
        token = null;
        try { sessionStorage.removeItem(tokenKey); } catch { /* Storage disabled. */ }
        status = 'needs_token';
        changed();
        throw new Error('Phoenix test token expired');
      }
      if (!response.ok) throw new Error(`pet pilot ${response.status}`);
      const body = await response.json();
      if (serial >= appliedSerial) {
        state = body.state || body;
        status = 'ready';
        appliedSerial = serial;
        changed();
      }
      return body;
    } catch (error) {
      if (serial >= appliedSerial) {
        status = testMode && !token ? 'needs_token' : 'offline';
        appliedSerial = serial;
        changed();
      }
      throw error;
    }
  }

  window.WingoPetPilot = {
    enabled: true,
    get state() { return state; },
    get status() { return status; },
    refresh() { return request('/state'); },
    rename(name) { return request('/name', { method: 'PATCH', body: JSON.stringify({ name }) }); },
    setToken(value) {
      if (!testMode) return Promise.reject(new Error('Not a remote test build'));
      token = value.trim();
      if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
        token = null;
        return Promise.reject(new Error('Invalid test token format'));
      }
      try { sessionStorage.setItem(tokenKey, token); } catch { /* Current page still works. */ }
      status = 'connecting';
      changed();
      return request('/state');
    },
    clearToken() {
      if (!testMode) return;
      token = null;
      state = null;
      status = 'needs_token';
      try { sessionStorage.removeItem(tokenKey); } catch { /* Storage disabled. */ }
      changed();
    },
  };

  window.addEventListener('wingo:bridge-event', (message) => {
    const event = message.detail;
    if (event?.type === 'GAME_START') roundId = crypto.randomUUID();
    if (event?.type !== 'GAME_RESULT' || (testMode && !token)) return;
    const result = { ...event.result, sessionId: `${event.result.sessionId}:${roundId || crypto.randomUUID()}` };
    roundId = null;
    request('/result', { method: 'POST', body: JSON.stringify(result) })
      .then((reply) => window.dispatchEvent(new CustomEvent('wingo:pet-result', { detail: reply })))
      .catch(() => {});
  });

  window.WingoPetPilot.refresh().catch(() => {});
})();
