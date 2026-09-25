#!/usr/bin/env node
/**
 * Дымовой тест каталога: прокликивает каждую игру в настоящем браузере.
 *
 * Зачем. Обычные юнит-тесты проверяют ядро игры (правила, генератор, счёт), но
 * не сцены Phaser: падение внутри `create()` они не видят. Именно так уехал баг
 * «Башни» — HUD строился раньше поля, `create()` обрывался на TypeError, экран
 * замирал и ни одна кнопка больше не отвечала. Тесты были зелёные.
 *
 * Как устроено. На каждую игру поднимается её dev-сервер (в dev-сборке игра
 * кладёт себя в `window.__<slug>` — оттуда берутся сцены, кнопки и их координаты).
 * Для каждой кнопки меню открывается своя вкладка: кнопка нажимается настоящим
 * курсором, дальше краулер N шагов тыкает случайные активные элементы и делает
 * свайпы — так он сам заходит в партию, обучение, экран проигрыша и обратно.
 * Любая ошибка страницы (`pageerror`, `console.error`) — падение теста.
 *
 * Запуск: `npm run check:smoke` (вся сеть игр) или `node scripts/smoke.mjs stack 2048`.
 */
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAMES_DIR = join(ROOT, 'games');

/** Шагов краулера после нажатия кнопки меню. Больше — дольше, но глубже. */
const STEPS = 14;
/** Шагов в отдельном долгом прогоне партии — чтобы дойти до экрана проигрыша. */
const LONG_STEPS = 60;
/** Сколько вкладок одной игры крутится одновременно. */
const LANES = 3;
const PORT_BASE = 8730;

// ── Браузер ───────────────────────────────────────────────────────────────────

/**
 * Chromium берём готовый: playwright-core сам браузеры не качает, а в CI и в
 * контейнере он уже стоит. Не нашли — тест не притворяется пройденным.
 */
function chromiumPath() {
  const fromEnv = [process.env.CHROMIUM_PATH, process.env.CHROME_PATH].filter(Boolean);
  const pwRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const guesses = [
    ...fromEnv,
    ...(pwRoot ? [join(pwRoot, 'chromium'), join(pwRoot, 'chrome-linux', 'chrome')] : []),
    '/opt/pw-browsers/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ];
  return guesses.find((p) => p && existsSync(p)) ?? null;
}

// ── Код, который выполняется внутри страницы ──────────────────────────────────

/**
 * Собирает активные элементы всех живых сцен: подпись, сцену и координаты точки
 * на странице, куда должен прийти курсор. Мир → холст считаем через камеру
 * (у неё zoom = DPR), холст → страницу — через `scale.displayScale`.
 */
const COLLECT = `(() => {
  const g = Object.keys(window)
    .map((k) => window[k])
    .find((v) => v && v.scene && v.scale && v.loop && v.canvas);
  if (!g) return { error: 'в window нет ручки игры (dev-сборка её кладёт сама)' };
  const rect = g.canvas.getBoundingClientRect();
  const ds = g.scale.displayScale;
  const items = [];
  for (const s of g.scene.getScenes(true)) {
    const cam = s.cameras.main;
    const walk = (list, inherited) => {
      const own = list.filter((o) => o.visible && o.type === 'Text' && o.text).map((o) => o.text);
      const labels = own.length ? own : inherited;
      for (const o of list) {
        if (!o.visible) continue;
        if (o.list) walk(o.list, labels);
        if (!o.input || !o.input.enabled) continue;
        const m = o.getWorldTransformMatrix();
        items.push({
          scene: s.scene.key,
          label: labels.join(' ').slice(0, 32) || o.type,
          x: Math.round(rect.left + ((m.tx - cam.worldView.x) * cam.zoom) / ds.x),
          y: Math.round(rect.top + ((m.ty - cam.worldView.y) * cam.zoom) / ds.y),
        });
      }
    };
    walk(s.children.list, []);
  }
  return { scenes: g.scene.getScenes(true).map((s) => s.scene.key), items };
})()`;

// ── Мелочи ────────────────────────────────────────────────────────────────────

/** Свой генератор: прогон должен повторяться, иначе падение не воспроизвести. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
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

function packageName(slug) {
  return JSON.parse(readFileSync(join(GAMES_DIR, slug, 'package.json'), 'utf8')).name;
}

// ── Один проход краулера ──────────────────────────────────────────────────────

/**
 * Открывает игру, нажимает заданную кнопку меню и дальше STEPS шагов тыкает
 * случайные активные элементы, изредка — свайп через центр (игры со свайпами
 * иначе не проверить). Возвращает список ошибок страницы.
 */
async function runFlow(browser, url, target, seed, steps = STEPS) {
  const page = await browser.newPage({ viewport: { width: 400, height: 800 }, hasTouch: true });
  const errors = [];
  const note = (msg) => {
    if (errors.length < 5) errors.push(msg.split('\n').slice(0, 3).join(' ⏎ '));
  };
  page.on('pageerror', (e) => note(`${e.message}\n${(e.stack ?? '').split('\n')[1] ?? ''}`));
  page.on('console', (m) => {
    if (m.type() === 'error') note(`console.error: ${m.text()}`);
  });

  const rand = rng(seed);
  try {
    await page.goto(url, { waitUntil: 'load' });
    await sleep(2500); // Boot ждёт INIT от приложения и только потом отдаёт меню

    const menu = await page.evaluate(COLLECT).catch(() => ({ error: 'меню не открылось' }));
    if (menu.error) return { errors: [menu.error], visited: [] };
    const hit = menu.items.find((i) => i.label.includes(target.label)) ?? menu.items[target.index];
    if (!hit) return { errors: [], visited: [] };
    await page.mouse.click(hit.x, hit.y);
    await sleep(900);

    const visited = new Set();
    for (let step = 0; step < steps && !errors.length; step++) {
      // Стрелка «назад» в меню уводит на хаб — это штатный выход, а не падение.
      const state = await page.evaluate(COLLECT).catch(() => ({ error: 'ушли со страницы' }));
      if (state.error) break;
      for (const s of state.scenes) visited.add(s);

      // В партии чаще бьём по полю, чем по кнопкам: иначе краулер сразу уходит
      // «назад» в меню и до проигрыша дело не доходит.
      const inGame = state.scenes.includes('Game') && rand() < 0.75;
      try {
        if (inGame && rand() < 0.5) {
          await page.mouse.click(60 + Math.floor(rand() * 280), 200 + Math.floor(rand() * 420));
        } else if (inGame || step % 4 === 3) {
        // Свайп через центр: единственный способ проверить 2048, «Пятнашки», «Змейку».
          const dirs = [[0, -160], [0, 160], [-140, 0], [140, 0]];
          const [dx, dy] = dirs[Math.floor(rand() * dirs.length)];
          await page.mouse.move(200, 430);
          await page.mouse.down();
          await page.mouse.move(200 + dx, 430 + dy, { steps: 8 });
          await page.mouse.up();
        } else if (state.items.length) {
          const it = state.items[Math.floor(rand() * state.items.length)];
          await page.mouse.click(it.x, it.y);
        } else {
          await page.mouse.click(200, 430); // поле без интерактивных объектов (тапалки)
        }
      } catch {
        break; // тот же уход на хаб, только посреди клика
      }
      await sleep(260);
    }
    return { errors, visited: [...visited] };
  } catch (e) {
    return { errors: [...errors, `упал сам тест: ${e.message}`], visited: [] };
  } finally {
    await page.close().catch(() => {});
  }
}

// ── Одна игра ─────────────────────────────────────────────────────────────────

async function checkGame(browser, slug, port) {
  const server = spawn('npm', ['run', 'dev', '-w', packageName(slug)], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  const url = `http://localhost:${port}/`;
  try {
    if (!(await waitForServer(url))) return [{ flow: 'dev-сервер', errors: ['не поднялся'] }];

    // Список кнопок меню снимаем один раз, дальше на каждую — своя чистая вкладка.
    const probe = await browser.newPage({ viewport: { width: 400, height: 800 } });
    await probe.goto(url, { waitUntil: 'load' });
    await sleep(2500);
    const menu = await probe.evaluate(COLLECT);
    await probe.close();
    if (menu.error) return [{ flow: 'меню', errors: [menu.error] }];

    const targets = menu.items.map((it, index) => ({ label: it.label, index }));
    const failures = [];
    const scenes = new Set();
    let playTarget = null;
    for (let i = 0; i < targets.length; i += LANES) {
      const batch = targets.slice(i, i + LANES);
      const results = await Promise.all(
        batch.map((t, k) => runFlow(browser, url, t, 1000 + i * 10 + k)),
      );
      results.forEach((res, k) => {
        res.visited.forEach((s) => scenes.add(s));
        if (res.visited.includes('Game') && !playTarget) playTarget = batch[k];
        if (res.errors.length) failures.push({ flow: batch[k].label, errors: res.errors });
      });
    }

    // Долгая партия: короткий обход до экрана проигрыша обычно не доживает,
    // а там считается счёт, отправка результата и награды — самое ломкое место.
    if (playTarget && !failures.length) {
      const long = await runFlow(browser, url, playTarget, 77, LONG_STEPS);
      long.visited.forEach((s) => scenes.add(s));
      if (long.errors.length) failures.push({ flow: `${playTarget.label} (долгая партия)`, errors: long.errors });
    }
    return failures.length ? failures : { ok: true, buttons: targets.length, scenes: [...scenes] };
  } finally {
    server.kill('SIGTERM');
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
let failed = 0;

console.log(`Дымовой тест: ${games.length} игр, ${STEPS} шагов краулера на кнопку\n`);
for (const [i, slug] of games.entries()) {
  process.stdout.write(`${slug} … `);
  const res = await checkGame(browser, slug, PORT_BASE + i);
  if (res.ok) {
    console.log(`ок (кнопок: ${res.buttons}, сцены: ${res.scenes.join(', ')})`);
  } else {
    failed++;
    console.log('ПАДЕНИЕ');
    for (const f of res) for (const e of f.errors) console.log(`   [${f.flow}] ${e}`);
  }
}
await browser.close();

console.log(failed ? `\nИгр с падениями: ${failed} из ${games.length}` : '\nВсе игры прошли.');
process.exit(failed ? 1 : 0);
