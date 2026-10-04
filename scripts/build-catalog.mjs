#!/usr/bin/env node
/**
 * Сборка единого каталога для одного Vercel-проекта:
 *   dist-all/
 *     index.html, fonts/          ← хаб (hub/)
 *     manifest.json               ← games/manifest.json (читается приложением)
 *     <slug>/                     ← games/<slug>/dist (билды игр, base './')
 *
 * Запускается ПОСЛЕ сборки всех игр (см. npm run build:all).
 */
import { rmSync, mkdirSync, existsSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-all');

function copyTree(source, destination) {
  if (!statSync(source).isDirectory()) { copyFileSync(source, destination); return; }
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source)) copyTree(join(source, entry), join(destination, entry));
}

const GAMES = [
  // логические / детские
  'soz', 'pairs', 'fifteen', '2048', 'sudoku-kids', 'sums',
  // аркадные
  'stack', 'flyer', 'targets', 'snake',
  // для малышей
  'sorting', 'color-sort', 'block-drop', 'counting', 'jigsaw',
  // знания
  'quiz',
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// Хаб — корень каталога. Копируем содержимое поэлементно: на Windows Node 24
// не всегда может применить метаданные исходной директории к уже созданной цели.
const hub = join(root, 'hub');
for (const entry of readdirSync(hub)) {
  copyTree(join(hub, entry), join(out, entry));
}

// Манифест каталога.
copyFileSync(join(root, 'games', 'manifest.json'), join(out, 'manifest.json'));

// Билды игр.
for (const slug of GAMES) {
  const dist = join(root, 'games', slug, 'dist');
  if (!existsSync(join(dist, 'index.html'))) {
    console.error(`✗ games/${slug}/dist не собран — запустите npm run build:all`);
    process.exit(1);
  }
  copyTree(dist, join(out, slug));
}

console.log(`✓ dist-all собран: хаб + ${GAMES.length} игр (${GAMES.join(', ')})`);
