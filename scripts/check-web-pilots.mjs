// Read-only browser check of the built catalog. No dev handles or injected scores.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launchQaBrowser } from './qa-runtime.mjs';

const base = new URL(process.env.PILOT_CHECK_URL || 'http://127.0.0.1:4179/');
const exe = [process.env.CHROMIUM_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(p => p && existsSync(p));
assert.ok(exe, 'An installed Chromium is required.');
const output = fileURLToPath(new URL('../output/playwright/web-pilots/', import.meta.url));
mkdirSync(output, { recursive: true });
const runtime = await launchQaBrowser(exe);
const errors = [], checks = [];
try {
  const context = await runtime.browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  // QA must not add synthetic sessions to the live telemetry service.
  await context.route('https://gamewingo-monitor-production.up.railway.app/monitor/collect', route => route.fulfill({
    status: 204, headers: { 'Access-Control-Allow-Origin': base.origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type' },
  }));
  await context.addInitScript(() => {
    window.__pilotEvents = [];
    window.addEventListener('wingo:bridge-event', event => window.__pilotEvents.push(event.detail));
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => {
    if (new URL(response.url()).origin === base.origin && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  const manifestResponse = await context.request.get(new URL('manifest.json', base).href);
  assert.ok(manifestResponse.ok());
  const manifest = await manifestResponse.json();
  assert.equal(manifest.games.length, 18);
  await page.goto(base.href);
  for (const [slug, age, playY] of [['tap-hoops', 'age6to9', 605], ['tanks', 'age10to13', 601]]) {
    const game = manifest.games.find(g => g.gameId === slug);
    assert.equal(game.status, 'prototype'); assert.equal(game.rewardsEnabled, false);
    assert.equal(game.ageGroup, age); assert.equal(game.leaderboard, false);
    const tile = page.locator(`a.tile[data-go="${slug}"]`);
    await tile.waitFor(); assert.match(await tile.innerText(), /Прототип · без наград/);
    await tile.scrollIntoViewIfNeeded();
    await page.waitForFunction(id => {
      const img = document.querySelector(`a.tile[data-go="${id}"] img`);
      return img?.complete && img.naturalWidth > 0;
    }, slug);
    await tile.screenshot({ path: `${output}/${slug}-card.png` });
    await tile.click();
    await page.waitForURL(`**/${slug}/**`);
    await page.waitForFunction(() => window.__pilotEvents.some(e => e.type === 'GAME_READY'));
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${output}/${slug}-menu.png` });
    const point = async (x, y) => page.locator('canvas').evaluate((canvas, p) => {
      const r = canvas.getBoundingClientRect();
      const h = Math.min(1024, Math.max(720, Math.round(400 * innerHeight / innerWidth)));
      return { x: r.left + p.x * r.width / 400, y: r.top + (p.y - (360 - h / 2)) * r.height / h };
    }, { x, y });
    const play = await point(200, playY); await page.touchscreen.tap(play.x, play.y);
    await page.waitForTimeout(300);
    const gesture = await point(slug === 'tanks' ? 303 : 200, slug === 'tanks' ? 620 : 460);
    await page.touchscreen.tap(gesture.x, gesture.y);
    await page.waitForFunction(() => window.__pilotEvents.some(e => e.type === 'GAME_START'));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${output}/${slug}-game.png` });
    await page.evaluate(() => history.back()); await page.waitForTimeout(350);
    await page.screenshot({ path: `${output}/${slug}-pause.png` });
    const events = await page.evaluate(() => window.__pilotEvents);
    assert.equal(events.filter(e => e.type === 'GAME_READY').length, 1);
    assert.equal(events.filter(e => e.type === 'GAME_START').length, 1);
    assert.ok(!events.some(e => ['GAME_ERROR', 'GAME_BONUS', 'REWARD_CLAIM', 'GAME_RESULT'].includes(e.type)));
    checks.push(`${slug}: manifest, age, pilot label, icon, built menu, real tutorial gesture, start and pause; no rewards`);
    await page.goto(base.href);
  }
  assert.deepEqual(errors, []);
  await context.close();
  console.log(JSON.stringify({ ok: true, base: base.href, checks, screenshots: output }, null, 2));
} finally { await runtime.close(); }
