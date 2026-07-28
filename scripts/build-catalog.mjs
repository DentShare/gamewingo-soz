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
import { cpSync, rmSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-all');

const GAMES = ['soz', 'pairs', 'fifteen', '2048', 'sudoku-kids'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// Хаб — корень каталога.
cpSync(join(root, 'hub'), out, { recursive: true });

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

console.log(`✓ dist-all собран: хаб + ${GAMES.length} игр (${GAMES.join(', ')})`);
