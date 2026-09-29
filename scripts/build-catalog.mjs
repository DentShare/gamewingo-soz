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
import { cpSync, rmSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
// esbuild приходит вместе с vite — отдельной зависимости не нужно.
import { build } from 'esbuild';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-all');

const GAMES = [
  // логические / детские
  'soz', 'pairs', 'fifteen', '2048', 'sudoku-kids', 'sums',
  // аркадные
  'stack', 'flyer', 'targets', 'snake',
  // для малышей
  'sorting', 'counting', 'jigsaw',
  // знания
  'quiz',
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// Хаб — корень каталога.
cpSync(join(root, 'hub'), out, { recursive: true });

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
copyFileSync(join(root, 'games', 'manifest.json'), join(out, 'manifest.json'));

// Билды игр.
for (const slug of GAMES) {
  const dist = join(root, 'games', slug, 'dist');
  if (!existsSync(join(dist, 'index.html'))) {
    console.error(`✗ games/${slug}/dist не собран — запустите npm run build:all`);
    process.exit(1);
  }
  cpSync(dist, join(out, slug), { recursive: true });
}

console.log(`✓ dist-all собран: хаб + progress.js + ${GAMES.length} игр (${GAMES.join(', ')})`);
