#!/usr/bin/env node
/**
 * Сборка единого каталога для одного Vercel-проекта:
 *   dist-all/
 *     index.html, fonts/          ← хаб (hub/)
 *     progress.js                 ← @gamewingo/game-progress для хаба (IIFE, window.WingoProgress)
 *     manifest.json               ← games/manifest.json (читается приложением)
 *     <slug>/                     ← games/<slug>/dist (билды игр, base './')
 *
 * Запускается ПОСЛЕ сборки всех игр (см. npm run build:all).
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync, existsSync, unlinkSync, rmdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { ageManifest } from '../hub/age-groups.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-all');
const manifest = ageManifest(JSON.parse(readFileSync(join(root, 'games', 'manifest.json'), 'utf8')));

function copyTree(source, destination) {
  if (!statSync(source).isDirectory()) { copyFileSync(source, destination); return; }
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source)) copyTree(join(source, entry), join(destination, entry));
}

const GAMES = [
  // логические / детские
  'soz', 'pairs', 'fifteen', '2048', 'sudoku-kids', 'sums',
  // аркадные
  'stack', 'flyer', 'targets', 'snake', 'tanks', 'tap-hoops',
  // для малышей
  'sorting', 'color-sort', 'block-drop', 'counting', 'jigsaw',
  // знания
  'quiz',
];

// Test builds must not leave token entry or API config in a later normal build.
if (resolve(out) !== resolve(root, 'dist-all')) throw new Error('Неверный путь сборки');
function clearTree(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) clearTree(path);
    else unlinkSync(path);
  }
  rmdirSync(dir);
}
clearTree(out);
mkdirSync(out, { recursive: true });

// Хаб — корень каталога. Копируем содержимое поэлементно: на Windows Node 24
// не всегда может применить метаданные исходной директории к уже созданной цели.
const hub = join(root, 'hub');
for (const entry of readdirSync(hub)) {
  copyTree(join(hub, entry), join(out, entry));
}

// Прогресс для хаба. Хаб — статический HTML без сборщика, но показывать ему нужно
// то же, что считают игры и сервер: задания дня, серию, потолок дня, статус игр.
// Поэтому он получает сам пакет game-progress, а не вторую копию правил.
await build({
  entryPoints: [join(root, 'packages', 'game-progress', 'src', 'index.ts')],
  outfile: join(out, 'progress.js'),
  bundle: true,
  format: 'iife',
  globalName: 'WingoProgress',
  minify: true,
  target: 'es2019',
  logLevel: 'warning',
});

// Манифест каталога.
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// Билды игр.
for (const slug of GAMES) {
  const dist = join(root, 'games', slug, 'dist');
  if (!existsSync(join(dist, 'index.html'))) {
    console.error(`✗ games/${slug}/dist не собран — запустите npm run build:all`);
    process.exit(1);
  }
  copyTree(dist, join(out, slug));
}

// Include the Phoenix client only in an explicitly configured pilot build.
const petPilotApi = (process.env.GAMEWINGO_PET_PILOT_API ?? '').replace(/\/$/, '');
const petTestApi = (process.env.GAMEWINGO_PET_TEST_API ?? '').replace(/\/$/, '');
if (petPilotApi && petTestApi) throw new Error('Choose one Phoenix pilot API');
if (petPilotApi || petTestApi) {
  const url = new URL(petPilotApi || petTestApi);
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((petPilotApi && !localHttp) || (petTestApi && url.protocol !== 'https:')
      || url.username || url.password || url.search || url.hash) {
    throw new Error('Phoenix pilot API URL must use local HTTP or remote HTTPS');
  }
  writeFileSync(join(out, 'pet-pilot-config.js'),
    `window.${petTestApi ? 'WINGO_PET_TEST_API' : 'WINGO_PET_PILOT_API'}=${JSON.stringify(petPilotApi || petTestApi).replace(/</g, '\\u003c')};\n`);
  if (petPilotApi) copyFileSync(join(root, 'scripts', 'pet-pilot-check.html'), join(out, 'pet-pilot-check.html'));
  if (petTestApi) copyFileSync(join(root, 'scripts', 'phoenix-test.html'), join(out, 'phoenix-test.html'));
  for (const slug of ['', 'phoenix.html', ...GAMES]) {
    const page = slug === 'phoenix.html' ? join(out, slug) : join(out, slug, 'index.html');
    const prefix = GAMES.includes(slug) ? '../' : './';
    const tags = `<script src="${prefix}pet-pilot-config.js"></script><script src="${prefix}phoenix-pilot.js"></script>`;
    writeFileSync(page, readFileSync(page, 'utf8').replace('</head>', `${tags}</head>`));
  }
}

// Публичный адрес приёмника; пароль отчёта никогда не попадает в статический билд.
const monitorApi = (process.env.GAMEWINGO_MONITOR_API ?? 'https://gamewingo-monitor-production.up.railway.app').replace(/\/$/, '');
if (monitorApi) {
  const url = new URL(monitorApi);
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password || url.search || url.hash) {
    throw new Error('GAMEWINGO_MONITOR_API must use HTTPS');
  }
  writeFileSync(join(out, 'monitor-config.js'),
    `window.WINGO_MONITOR_API=${JSON.stringify(monitorApi).replace(/</g, '\\u003c')};\n`);
  for (const slug of ['', ...GAMES]) {
    const page = join(out, slug, 'index.html');
    const prefix = slug ? '../' : './';
    const tags = `<script src="${prefix}monitor-config.js"></script><script src="${prefix}monitor.js"></script>`;
    writeFileSync(page, readFileSync(page, 'utf8').replace('</head>', `${tags}</head>`));
  }
}

console.log(`✓ dist-all собран: хаб + progress.js + ${GAMES.length} игр (${GAMES.join(', ')})`);
