#!/usr/bin/env node
/**
 * Проверка системного «назад» во всех играх каталога.
 *
 * В WebView кнопка «назад» телефона (и жест iOS, и «назад» браузера) приходит
 * в игру как `popstate`. Правило каталога одно на все игры (docs/DESIGN.md):
 * партия → пауза → меню → каталог, с итогов — в меню. В детских играх меню
 * «назад» не покидает: выход только через «Родителям» (удержание 2 с).
 *
 * Как устроено. На каждую игру поднимается её dev-сервер (игра кладёт себя в
 * `window.__<slug>`), дальше настоящий `history.back()` на каждом экране:
 *   1. партия: «назад» → открыта пауза; ещё раз «назад» → меню;
 *   2. партия заканчивается (`endGame`/`endRound`) → итоги: «назад» → меню;
 *   3. детские: «Родителям» удержанием, «назад» закрывает меню родителей;
 *   4. меню: «назад» → выход в каталог (страница уходит), у детских — остаёмся.
 * Любая ошибка страницы — тоже падение.
 *
 * Запуск: `npm run check:back` или `node scripts/back.mjs pairs soz`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAMES_DIR = join(ROOT, 'games');
const PORT_BASE = 8830;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chromiumPath() {
  const pwRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const guesses = [
    process.env.CHROMIUM_PATH,
    process.env.CHROME_PATH,
    ...(pwRoot ? [join(pwRoot, 'chromium'), join(pwRoot, 'chrome-linux', 'chrome')] : []),
    '/opt/pw-browsers/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ];
  return guesses.find((p) => p && existsSync(p)) ?? null;
}

async function waitForServer(url, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      /* сервер ещё поднимается */
    }
    await sleep(300);
  }
  return false;
}

function listGames() {
  return readdirSync(GAMES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(GAMES_DIR, d.name, 'package.json')))
    .map((d) => d.name)
    .sort();
}

const packageName = (slug) => JSON.parse(readFileSync(join(GAMES_DIR, slug, 'package.json'), 'utf8')).name;

/** Детские игры: флаг `kidsMode` в манифесте каталога. */
const KIDS = new Set(
  JSON.parse(readFileSync(join(GAMES_DIR, 'manifest.json'), 'utf8')).games
    .filter((g) => g.kidsMode)
    .map((g) => g.gameId),
);

// ── Код внутри страницы ───────────────────────────────────────────────────────

/** Ручка игры: dev-сборка кладёт Phaser.Game в window.__<slug>. */
const HANDLE = `(() => Object.keys(window).map((k) => window[k]).find((v) => v && v.scene && v.scale && v.loop && v.canvas))()`;

const STATE = `(() => {
  const g = ${HANDLE};
  if (!g) return null;
  const scenes = g.scene.getScenes(true).map((s) => s.scene.key);
  const game = g.scene.getScene('Game');
  // Пауза-шит и шиты меню живут на глубине 1000.
  const sheet = scenes.some((k) => g.scene.getScene(k).children.list.some((o) => o.depth === 1000 && o.active !== false));
  return { scenes, sheet, gameActive: scenes.includes('Game') && !!game };
})()`;

/** Запустить партию первого уровня так же, как её запускает меню. */
const START = (slug) => `(() => {
  const g = ${HANDLE};
  g.registry.set('level', 1);
  g.registry.set('mode', ${JSON.stringify(slug === 'soz' ? 'practice' : 'level')});
  g.registry.set('resume', false);
  const cur = g.scene.getScenes(true)[0];
  cur.scene.start('Game');
})()`;

/** Закончить партию: у каждой игры свой метод итога. */
const END = `(() => {
  const g = ${HANDLE};
  const s = g.scene.getScene('Game');
  for (const m of ['endGame', 'endRound']) {
    if (typeof s[m] === 'function') { s[m](); return m; }
  }
  return null;
})()`;

async function until(page, pred, timeoutMs = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const st = await page.evaluate(STATE).catch(() => null);
    if (st && pred(st)) return st;
    await sleep(200);
  }
  return page.evaluate(STATE).catch(() => null);
}

// ── Одна игра ─────────────────────────────────────────────────────────────────

async function checkGame(browser, slug, port) {
  const isWindows = process.platform === 'win32';
  const npmArgs = ['run', 'dev', '-w', packageName(slug), '--', '--port', String(port), '--host', '127.0.0.1'];
  const command = isWindows ? (process.env.ComSpec ?? 'cmd.exe') : 'npm';
  const args = isWindows ? ['/d', '/s', '/c', 'npm', ...npmArgs] : npmArgs;
  const server = spawn(command, args, {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
    detached: true,
    windowsHide: true,
  });
  const url = `http://127.0.0.1:${port}/`;
  const problems = [];
  const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  const back = async () => {
    await page.evaluate(() => history.back());
    await sleep(700);
  };

  try {
    if (!(await waitForServer(url))) return ['dev-сервер не поднялся'];
    await page.goto(url, { waitUntil: 'load' });
    const menu = await until(page, (s) => s.scenes.includes('MainMenu'), 15000);
    if (!menu?.scenes.includes('MainMenu')) return ['меню не открылось'];
    await sleep(600);

    // 1. Партия → пауза → меню.
    await page.evaluate(START(slug));
    let st = await until(page, (s) => s.gameActive);
    if (!st?.gameActive) problems.push('партия не запустилась');
    else {
      await sleep(900);
      await back();
      st = await until(page, (s) => s.sheet && s.scenes.includes('Game'), 3000);
      if (!(st?.sheet && st.scenes.includes('Game'))) problems.push(`партия: «назад» не открыл паузу (сцены: ${st?.scenes})`);
      await back();
      st = await until(page, (s) => s.scenes.includes('MainMenu') && !s.scenes.includes('Game'), 5000);
      if (!st?.scenes.includes('MainMenu')) problems.push(`пауза: «назад» не увёл в меню (сцены: ${st?.scenes})`);
    }

    // 2. Итоги → меню.
    await page.evaluate(START(slug));
    st = await until(page, (s) => s.gameActive);
    if (st?.gameActive) {
      await sleep(900);
      const how = await page.evaluate(END).catch((e) => `ошибка: ${e.message}`);
      st = await until(page, (s) => s.scenes.includes('GameOver'), 12000);
      if (!st?.scenes.includes('GameOver')) problems.push(`не дошли до итогов (${how}; сцены: ${st?.scenes})`);
      else {
        await sleep(900);
        await back();
        st = await until(page, (s) => s.scenes.includes('MainMenu'), 5000);
        if (!st?.scenes.includes('MainMenu')) problems.push(`итоги: «назад» не увёл в меню (сцены: ${st?.scenes})`);
      }
    }

    // 2б. Детские: «Родителям» (удержание) → «назад» закрывает шит, игра остаётся.
    if (KIDS.has(slug)) {
      await until(page, (s) => s.scenes.includes('MainMenu'), 3000);
      await sleep(600);
      const pt = await page.evaluate(`(() => {
        const g = ${HANDLE};
        const cam = g.scene.getScene('MainMenu').cameras.main;
        const r = g.canvas.getBoundingClientRect();
        return { x: r.left + (50 - cam.worldView.x) / cam.worldView.width * r.width,
                 y: r.top + (28 - cam.worldView.y) / cam.worldView.height * r.height };
      })()`);
      await page.mouse.move(pt.x, pt.y);
      await page.mouse.down();
      st = await until(page, (s) => s.sheet, 12000);
      await page.mouse.up();
      if (!st?.sheet) problems.push('детское меню: «Родителям» не открылось удержанием');
      else {
        await sleep(500);
        await back();
        st = await until(page, (s) => !s.sheet, 3000);
        if (st?.sheet) problems.push('«Родителям»: «назад» не закрыл меню родителей');
        if (!st?.scenes.includes('MainMenu')) problems.push(`«Родителям»: после «назад» не в меню (сцены: ${st?.scenes})`);
      }
    }

    // 3. Меню → каталог; у детских игр меню «назад» не покидает.
    await until(page, (s) => s.scenes.includes('MainMenu'), 3000);
    await sleep(600);
    // Метка на странице: пропала — значит, игру покинули (переход на каталог).
    // Смена записи истории внутри страницы метку не трогает.
    await page.evaluate(() => { window.__stayMark = true; });
    await back();
    await sleep(1500);
    const left = !(await page.evaluate(() => window.__stayMark === true).catch(() => false));
    if (KIDS.has(slug)) {
      st = await page.evaluate(STATE).catch(() => null);
      if (left || !st?.scenes.includes('MainMenu')) problems.push('детское меню: «назад» вывел из игры (должен только через «Родителям»)');
    } else if (!left) {
      problems.push('меню: «назад» не вывел в каталог');
    }

    if (errors.length) problems.push(...errors.slice(0, 3).map((e) => `ошибка страницы: ${e}`));
    return problems;
  } catch (e) {
    return [...problems, `упал сам тест: ${e.message}`];
  } finally {
    await page.close().catch(() => {});
    if (isWindows) spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    else { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); } }
  }
}

// ── Прогон ────────────────────────────────────────────────────────────────────

const only = process.argv.slice(2);
const games = only.length ? only : listGames();
const exe = chromiumPath();
if (!exe) {
  console.error('Chromium не найден. Укажите путь в CHROMIUM_PATH или поставьте chromium.');
  process.exit(2);
}
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: exe });

console.log(`Системный «назад»: ${games.length} игр\n`);
let failed = 0;
for (const [i, slug] of games.entries()) {
  process.stdout.write(`${slug}${KIDS.has(slug) ? ' (детская)' : ''} … `);
  const problems = await checkGame(browser, slug, PORT_BASE + i);
  if (!problems.length) console.log('ок');
  else {
    failed++;
    console.log('ПРОБЛЕМЫ');
    for (const p of problems) console.log(`   ${p}`);
  }
}
await browser.close();
console.log(failed ? `\nИгр с проблемами: ${failed} из ${games.length}` : '\nВо всех играх «назад» ведёт куда нужно.');
process.exit(failed ? 1 : 0);
