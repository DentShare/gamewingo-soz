// Isolated local QA; never attaches to the user's browser or reward APIs.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const url = process.env.HOOPS_QA_URL || 'http://127.0.0.1:4182/';
const output = fileURLToPath(new URL('../../../output/playwright/tap-hoops/', import.meta.url));
mkdirSync(output, { recursive: true });
const executablePath = [process.env.CHROMIUM_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(p => p && existsSync(p));
assert.ok(executablePath, 'Set CHROMIUM_PATH to an installed browser. No browser download.');
const server = await chromium.launchServer({ executablePath, headless: true });
const browser = await chromium.connect(server.wsEndpoint());
const errors = [], checks = [];
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 740 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.route('**/*', route => {
      const target = new URL(route.request().url());
      if (target.hostname === '127.0.0.1' || target.protocol === 'data:') return route.continue();
      errors.push(`Unexpected request: ${target.origin}`); return route.abort();
    });
    await page.goto(`${url}?lang=ru`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__tapHoops?.scene.isActive('MainMenu'));
    const scene = () => page.evaluate(() => window.__tapHoops.scene.getScenes(true)[0].scene.key);
    const state = () => page.evaluate(() => {
      const s = window.__tapHoops.scene.getScene('Game'), w = s.world;
      return { elapsed: w.elapsedMs, remaining: w.remainingMs, ball: w.ball, training: w.training,
        paused: s.paused, taps: w.taps, baskets: w.baskets, clean: w.cleanBaskets, score: w.score };
    });
    const point = (x, y) => page.evaluate(({ x, y }) => {
      const g = window.__tapHoops, s = g.scene.getScenes(true)[0], r = g.canvas.getBoundingClientRect(), cam = s.cameras.main;
      return { x: r.left + (x - cam.worldView.x) * cam.zoom / g.scale.displayScale.x,
        y: r.top + (y - cam.worldView.y) * cam.zoom / g.scale.displayScale.y };
    }, { x, y });
    const clickText = async value => {
      await page.waitForTimeout(300);
      const pos = await page.evaluate(value => {
        const g = window.__tapHoops, s = g.scene.getScenes(true)[0];
        function find(list) {
          for (const o of list) {
            if (!o.visible || !o.list) continue;
            if (o.list.some(c => c.type === 'Text' && c.text === value) && o.list.some(c => c.input?.enabled)) {
              const m = o.getWorldTransformMatrix(), r = g.canvas.getBoundingClientRect(), cam = s.cameras.main;
              return { x: r.left + (m.tx - cam.worldView.x) * cam.zoom / g.scale.displayScale.x,
                y: r.top + (m.ty - cam.worldView.y) * cam.zoom / g.scale.displayScale.y };
            }
            const match = find(o.list); if (match) return match;
          }
        }
        return find(s.children.list);
      }, value);
      assert.ok(pos, `Button not found: ${value}`);
      await page.mouse.click(pos.x, pos.y); await page.waitForTimeout(150);
    };
    await page.screenshot({ path: `${output}/menu-${viewport.width}.png` });
    await clickText('На площадку'); assert.equal(await scene(), 'Game');
    const initial = await state(); assert.equal(initial.training, true);
    await page.waitForTimeout(500); assert.deepEqual(await state(), initial);
    const field = await point(200, 460);
    await page.touchscreen.tap(field.x, field.y);
    await page.waitForFunction(() => !window.__tapHoops.scene.getScene('Game').world.training);
    const started = await state(); assert.equal(started.score, 0); assert.equal(started.taps, 0);
    checks.push(`${viewport.width}: one real touch completes training; no training score or gesture leaks into the round`);
    await page.mouse.move(field.x, field.y); await page.mouse.down(); await page.waitForTimeout(450);
    assert.equal((await state()).taps, 1);
    await page.screenshot({ path: `${output}/flight-${viewport.width}.png` });
    await page.waitForTimeout(400); await page.mouse.up(); assert.equal((await state()).taps, 1);
    checks.push(`${viewport.width}: holding touch gives exactly one impulse`);
    const before = await state();
    await page.evaluate(() => {
      const w = window.__tapHoops.scene.getScene('Game').world;
      w.hoop.scored = false; w.hoop.dirty = false; w.lastBasketMs = w.elapsedMs - 1000; w.remainingMs = 5000;
      Object.assign(w.ball, { x: w.hoop.x, y: w.hoop.y - 4, vx: 0, vy: 200 });
    });
    await page.waitForFunction(n => window.__tapHoops.scene.getScene('Game').world.baskets > n, before.baskets);
    const scored = await state(); assert.equal(scored.score, before.score + 150); assert.equal(scored.clean, before.clean + 1);
    assert.ok(scored.remaining > 8500);
    await page.screenshot({ path: `${output}/basket-${viewport.width}.png` });
    checks.push(`${viewport.width}: real physics crossing scores once, adds time and drives the net`);
    await page.keyboard.down('Space'); await page.waitForTimeout(150);
    const held = (await state()).taps;
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const frozen = await state(); assert.equal(frozen.paused, true);
    await page.waitForTimeout(350); assert.deepEqual(await state(), frozen);
    await page.evaluate(() => window.postMessage({ type: 'RESUME' }, '*'));
    await page.waitForTimeout(100); assert.equal((await state()).paused, true);
    await clickText('Продолжить'); await page.waitForTimeout(200); assert.equal((await state()).taps, held);
    await page.keyboard.up('Space'); await page.waitForTimeout(70);
    await page.keyboard.down('Space'); await page.waitForTimeout(70); await page.keyboard.up('Space');
    assert.equal((await state()).taps, held + 1);
    assert.equal(await page.evaluate(() => scrollY), 0);
    checks.push(`${viewport.width}: pause freezes physics/time; RESUME and a held key cannot restart input`);
    await page.evaluate(() => history.back()); await page.waitForTimeout(350); assert.equal((await state()).paused, true);
    await page.evaluate(() => history.back()); await page.waitForTimeout(350); assert.equal(await scene(), 'MainMenu');
    await clickText('На площадку'); assert.equal((await state()).training, false);
    await page.evaluate(() => {
      localStorage.setItem('wingo:bonus', '{"balance":123}');
      window.__tapHoops.scene.getScene('Game').world.remainingMs = 1;
    });
    await page.waitForFunction(() => window.__tapHoops.scene.isActive('GameOver'));
    assert.equal(await page.evaluate(() => localStorage.getItem('wingo:bonus')), '{"balance":123}');
    await page.screenshot({ path: `${output}/result-${viewport.width}.png` });
    await clickText('Ещё броски'); assert.equal((await state()).taps, 0);
    await page.keyboard.press('Escape'); await clickText('Начать заново'); assert.equal((await state()).taps, 0);
    await page.evaluate(() => history.back()); await page.waitForTimeout(300);
    await page.evaluate(() => history.back()); await page.waitForTimeout(300);
    checks.push(`${viewport.width}: back, result, retry and restart work; no reward storage changes`);
    await clickText('UZ'); await clickText('Maydonga');
    await page.screenshot({ path: `${output}/game-uz-${viewport.width}.png` });
    await page.keyboard.press('Escape'); await clickText('Davom etish');
    checks.push(`${viewport.width}: Uzbek gameplay and pause render`);
    await context.close();
  }
  const reduced = await browser.newContext({ viewport: { width: 360, height: 740 }, reducedMotion: 'reduce' });
  const page = await reduced.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__tapHoops?.scene.isActive('MainMenu'));
  await page.evaluate(() => {
    const g = window.__tapHoops; g.registry.set('hoopsTaught', true); g.scene.start('Game');
  });
  await page.waitForFunction(() => window.__tapHoops.scene.isActive('Game'));
  await page.keyboard.press('Space'); await page.waitForTimeout(150);
  const quiet = await page.evaluate(() => {
    const s = window.__tapHoops.scene.getScene('Game');
    return { x: s.ball.root.scaleX, y: s.ball.root.scaleY, rotation: s.ball.ball.rotation, taps: s.world.taps };
  });
  assert.deepEqual(quiet, { x: 1, y: 1, rotation: 0, taps: 1 });
  await page.evaluate(() => {
    const w = window.__tapHoops.scene.getScene('Game').world;
    w.hoop.scored = false; w.hoop.dirty = false; w.lastBasketMs = w.elapsedMs - 1000;
    Object.assign(w.ball, { x: w.hoop.x, y: w.hoop.y - 1, vx: 0, vy: 200 });
  });
  await page.waitForFunction(() => window.__tapHoops.scene.getScene('Game').world.netPulseMs > 0);
  const net = await page.evaluate(() => [...window.__tapHoops.scene.getScene('Game').basketBack.commandBuffer]);
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(() => [...window.__tapHoops.scene.getScene('Game').basketBack.commandBuffer]), net);
  checks.push('reduced-motion: physics and scoring work without ball squash, rotation or net swing');
  await reduced.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, checks, screenshots: output }, null, 2));
} finally {
  const bounded = async work => { let timer; try { await Promise.race([work,
    new Promise(resolve => { timer = setTimeout(resolve, 3000); })]); } finally { clearTimeout(timer); } };
  await bounded(browser.close()); await bounded(server.close());
  if (server.process().exitCode === null) server.process().kill();
}
