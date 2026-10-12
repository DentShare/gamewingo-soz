// Focused local browser regression, using the repository's playwright-core dependency.
// No production requests or reward endpoints. Dev-only Phaser handle is used for assertions.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const url = process.env.TANKS_QA_URL || 'http://127.0.0.1:4181/';
const output = fileURLToPath(new URL('../../../output/playwright/tanks/', import.meta.url));
mkdirSync(output, { recursive: true });
const executablePath = [process.env.CHROMIUM_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
].find(p => p && existsSync(p));
assert.ok(executablePath, 'Set CHROMIUM_PATH to an installed browser; no download is performed.');
// Keep the exact child-process handle so cleanup cannot hang on a Windows browser.
// This process belongs only to this isolated QA run, never to the user's browser.
const server = await chromium.launchServer({ executablePath, headless: true });
const browser = await chromium.connect(server.wsEndpoint());
const errors = [];
const checks = [];
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 740 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/*', route => {
      const target = new URL(route.request().url());
      if (target.hostname === '127.0.0.1' || target.protocol === 'data:') return route.continue();
      errors.push(`Unexpected external request: ${target.origin}`); return route.abort();
    });
    await page.goto(`${url}?lang=ru`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__tanks?.scene.isActive('MainMenu'));
    const scene = () => page.evaluate(() => window.__tanks.scene.getScenes(true)[0].scene.key);
    const world = () => page.evaluate(() => {
      const s = window.__tanks.scene.getScene('Game');
      return { elapsed: s.world.elapsedMs, x: s.world.player.x, y: s.world.player.y,
        training: s.world.training, paused: s.paused, fire: s.touches.fire,
        stick: s.touches.stick, direction: s.touches.direction, bullets: s.world.bullets.length };
    });
    const point = (x, y) => page.evaluate(({ x, y }) => {
      const g = window.__tanks, s = g.scene.getScenes(true)[0], r = g.canvas.getBoundingClientRect();
      return { x: r.left + (x - s.cameras.main.worldView.x) * s.cameras.main.zoom / g.scale.displayScale.x,
        y: r.top + (y - s.cameras.main.worldView.y) * s.cameras.main.zoom / g.scale.displayScale.y };
    }, { x, y });
    const clickText = async text => {
      // The shared pause panel slides in for 220 ms; measure after its animation.
      await page.waitForTimeout(300);
      const coordinate = await page.evaluate(text => {
        const g = window.__tanks, s = g.scene.getScenes(true)[0];
        function search(list) {
          for (const o of list) {
            if (!o.visible || !o.list) continue;
            if (o.list.some(c => c.type === 'Text' && c.text === text) && o.list.some(c => c.input?.enabled)) {
              const m = o.getWorldTransformMatrix(), r = g.canvas.getBoundingClientRect(), cam = s.cameras.main;
              return { x: r.left + (m.tx - cam.worldView.x) * cam.zoom / g.scale.displayScale.x,
                y: r.top + (m.ty - cam.worldView.y) * cam.zoom / g.scale.displayScale.y };
            }
            const found = search(o.list); if (found) return found;
          }
        }
        return search(s.children.list);
      }, text);
      assert.ok(coordinate, `Button not found: ${text}`);
      await page.mouse.click(coordinate.x, coordinate.y); await page.waitForTimeout(250);
    };
    await page.screenshot({ path: `${output}/menu-${viewport.width}.png` });
    await clickText('Защитить ядро'); assert.equal(await scene(), 'Game');
    assert.equal((await world()).training, true);
    await page.waitForTimeout(400); assert.equal((await world()).elapsed, 0);
    const fire = await point(303, 620);
    await page.touchscreen.tap(fire.x, fire.y);
    await page.waitForFunction(() => !window.__tanks.scene.getScene('Game').world.training);
    checks.push(`${viewport.width}: tutorial tap completes, timer starts afterwards`);
    // Simultaneous independent touch pointers, real browser touch events via CDP.
    const cdp = await context.newCDPSession(page);
    const stick = await point(97, 620), moved = await point(132, 620);
    const touches = [{ id: 1, x: stick.x, y: stick.y }, { id: 2, x: fire.x, y: fire.y }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...touches[0], ...moved }, touches[1]] });
    await page.waitForTimeout(200);
    const moving = await world();
    assert.equal(moving.direction, 'right'); assert.notEqual(moving.fire, null); assert.ok(moving.x > 165);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(80); assert.equal((await world()).fire, null); assert.equal((await world()).stick, null);
    checks.push(`${viewport.width}: real two-finger movement + fire, release clears both`);
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${output}/game-${viewport.width}.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300); const paused = await world(); assert.equal(paused.paused, true);
    await page.waitForTimeout(350); assert.equal((await world()).elapsed, paused.elapsed);
    await page.evaluate(() => window.postMessage({ type: 'RESUME' }, '*'));
    await page.waitForTimeout(100); assert.equal((await world()).paused, true);
    await page.screenshot({ path: `${output}/pause-${viewport.width}.png` });
    await clickText('Продолжить'); assert.equal((await world()).paused, false);
    await page.evaluate(() => window.postMessage({ type: 'PAUSE' }, '*'));
    await page.waitForTimeout(300); assert.equal((await world()).paused, true);
    await page.evaluate(() => window.postMessage({ type: 'RESUME' }, '*'));
    await page.waitForTimeout(100); assert.equal((await world()).paused, true);
    await clickText('Продолжить');
    checks.push(`${viewport.width}: pause freezes time; host RESUME cannot dismiss it`);
    // Real browser history follows play -> pause -> menu, without leaving the document.
    await page.evaluate(() => history.back()); await page.waitForTimeout(300); assert.equal((await world()).paused, true);
    await page.evaluate(() => history.back()); await page.waitForTimeout(300); assert.equal(await scene(), 'MainMenu');
    await clickText('Защитить ядро'); assert.equal((await world()).training, false);
    await page.keyboard.press('Escape'); await clickText('Начать заново');
    assert.equal(await scene(), 'Game'); assert.equal((await world()).paused, false);
    checks.push(`${viewport.width}: back chain and restart without a second tutorial`);
    // Reproduce the reported sideways shot: aim right while the route points down.
    await page.evaluate(() => {
      const s = window.__tanks.scene.getScene('Game'), w = s.world;
      w.tiles.fill('empty'); w.spawns = []; w.bullets = [];
      w.player.x = 225; w.player.y = 165;
      w.bots = [{ ...w.player, id: 900, x: 165, y: 165, direction: 'down', hp: 1,
        shield: 0, cooldown: 0, target: { x: 165, y: 195 }, aim: null }];
    });
    await page.waitForFunction(() => window.__tanks.scene.getScene('Game').world.bots[0]?.aim?.phase === 'turn');
    const turned = await page.evaluate(() => {
      const s = window.__tanks.scene.getScene('Game');
      return { angle: s.views.get(900).root.rotation, bullets: s.world.bullets.length };
    });
    assert.ok(Math.abs(turned.angle - Math.PI / 2) < 1e-6); assert.equal(turned.bullets, 0);
    await page.waitForFunction(() => window.__tanks.scene.getScene('Game').world.bots[0]?.aim?.phase === 'recoil');
    const fired = await page.evaluate(() => {
      const s = window.__tanks.scene.getScene('Game');
      return { angle: s.views.get(900).root.rotation, direction: s.world.bullets.find(b => b.enemy)?.direction };
    });
    assert.equal(fired.direction, 'right'); assert.ok(Math.abs(fired.angle - Math.PI / 2) < 1e-6);
    await page.screenshot({ path: `${output}/bot-aim-${viewport.width}.png` });
    checks.push(`${viewport.width}: bot barrel turns before firing and stays aligned with the new bullet`);
    const clearWave = async wave => {
      await page.evaluate(wave => {
        const w = window.__tanks.scene.getScene('Game').world;
        Object.assign(w, { wave, waves: wave - 1, bots: [], spawns: [], bullets: [], intermission: 0,
          powerShieldMs: 0, choicePending: false });
        w.player.hp = 2;
      }, wave);
      await page.waitForFunction(() => window.__tanks.scene.getScene('Game').world.choicePending);
    };
    await clearWave(3);
    const frozen = await page.evaluate(() => JSON.stringify(window.__tanks.scene.getScene('Game').world));
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('Space');
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => JSON.stringify(window.__tanks.scene.getScene('Game').world)), frozen);
    await page.screenshot({ path: `${output}/power-choice-${viewport.width}.png` });
    await page.evaluate(() => window.postMessage({ type: 'PAUSE' }, '*'));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.postMessage({ type: 'RESUME' }, '*'));
    assert.equal((await world()).paused, true);
    await clickText('Продолжить');
    assert.equal(await page.evaluate(() => window.__tanks.scene.getScene('Game').world.choicePending), true);
    await clickText('Взять щит');
    assert.equal(await page.evaluate(() => window.__tanks.scene.getScene('Game').world.power), 'shield');
    const ability = await point(200, 620);
    await page.touchscreen.tap(ability.x, ability.y);
    await page.waitForTimeout(100);
    const shield = await page.evaluate(() => {
      const w = window.__tanks.scene.getScene('Game').world;
      return { power: w.power, ms: w.powerShieldMs };
    });
    assert.equal(shield.power, null); assert.ok(shield.ms > 4500 && shield.ms <= 5000);
    await page.screenshot({ path: `${output}/power-shield-${viewport.width}.png` });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const pausedShield = await page.evaluate(() => window.__tanks.scene.getScene('Game').world.powerShieldMs);
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.__tanks.scene.getScene('Game').world.powerShieldMs), pausedShield);
    await clickText('Продолжить');
    checks.push(`${viewport.width}: wave-3 choice freezes combat, survives host pause, shield activates by tap and pauses its duration`);
    await clearWave(6); await clickText('Взять ремонт');
    assert.equal(await page.evaluate(() => window.__tanks.scene.getScene('Game').world.player.hp), 2);
    await page.touchscreen.tap(ability.x, ability.y); await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__tanks.scene.getScene('Game').world.player.hp), 3);
    assert.equal(await page.evaluate(() => window.__tanks.scene.getScene('Game').world.power), null);
    await clearWave(9); await clickText('Взять ремонт');
    await page.evaluate(() => { window.__tanks.scene.getScene('Game').world.player.hp = 3; });
    await page.keyboard.down('e'); await page.waitForTimeout(50); await page.keyboard.up('e'); await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => window.__tanks.scene.getScene('Game').world.power), 'repair');
    await page.evaluate(() => { window.__tanks.scene.getScene('Game').world.player.hp = 2; });
    await page.keyboard.down('e'); await page.waitForTimeout(50); await page.keyboard.up('e'); await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => window.__tanks.scene.getScene('Game').world.player.hp), 3);
    await page.keyboard.press('Escape'); await clickText('Начать заново');
    assert.equal(await page.evaluate(() => window.__tanks.scene.getScene('Game').world.power), null);
    assert.equal(await page.evaluate(() => window.__tanks.scene.getScene('Game').world.powerShieldMs), 0);
    checks.push(`${viewport.width}: repair restores one armor on tap/E, full armor keeps charge, restart resets powers`);
    // Force only the terminal condition, keeping the real result-rendering/bridge path.
    await page.evaluate(() => { window.__tanks.scene.getScene('Game').world.ended = 'core'; });
    await page.waitForFunction(() => window.__tanks.scene.isActive('GameOver'));
    await page.screenshot({ path: `${output}/result-${viewport.width}.png` });
    await clickText('В меню'); await clickText('UZ');
    await clickText('Yadroni himoya qilish'); assert.equal(await scene(), 'Game');
    await page.screenshot({ path: `${output}/game-uz-${viewport.width}.png` });
    await clearWave(3);
    await page.screenshot({ path: `${output}/power-choice-uz-${viewport.width}.png` });
    await clickText('Qalqonni olish');
    await page.waitForFunction(() => {
      const w = window.__tanks.scene.getScene('Game').world;
      return w.wave === 4 && w.bots.some(b => b.route !== 'direct');
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${output}/flanker-uz-${viewport.width}.png` });
    checks.push(`${viewport.width}: wave-4 flanker spawns on the original map with the stored power ready`);
    await page.keyboard.press('Escape');
    await clickText('Davom etish');
    checks.push(`${viewport.width}: results and Uzbek gameplay/pause render`);
    await context.close();
  }
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  console.log(JSON.stringify({ ok: true, checks, screenshots: output }, null, 2));
} finally {
  const bounded = async work => {
    let timeout;
    try { await Promise.race([work, new Promise(resolve => { timeout = setTimeout(resolve, 3000); })]); }
    finally { clearTimeout(timeout); }
  };
  await bounded(browser.close()); await bounded(server.close());
  if (server.process().exitCode === null) server.process().kill();
}
