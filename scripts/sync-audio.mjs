#!/usr/bin/env node
/**
 * Разложить общий звуковой пак по играм.
 *
 * Мастер-копия одна — `packages/game-ui/audio/` (там же файл лицензии CC0).
 * Каждая игра собирается своим Vite-проектом и умеет отдавать только своё
 * `public/`, поэтому файлы копируются в `games/<slug>/public/audio/`.
 * Копии коммитятся: так дев-режим работает без предварительных команд,
 * а сборка на Vercel не зависит от лишнего шага.
 *
 *   node scripts/sync-audio.mjs           # разложить
 *   node scripts/sync-audio.mjs --check   # только проверить (код 1 при расхождении)
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MASTER = join(ROOT, 'packages/game-ui/audio');
const GAMES = join(ROOT, 'games');

const check = process.argv.includes('--check');

if (!existsSync(MASTER)) {
  console.error(`Нет мастер-пака: ${MASTER}`);
  process.exit(2);
}

const files = readdirSync(MASTER).filter((f) => f.endsWith('.mp3')).sort();
if (!files.length) {
  console.error('В мастер-паке нет .mp3');
  process.exit(2);
}

const slugs = readdirSync(GAMES, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(GAMES, e.name, 'public')))
  .map((e) => e.name)
  .sort();

const stale = [];
let copied = 0;

for (const slug of slugs) {
  const dest = join(GAMES, slug, 'public/audio');
  if (!check) mkdirSync(dest, { recursive: true });
  for (const file of files) {
    const from = join(MASTER, file);
    const to = join(dest, file);
    const same = existsSync(to) && statSync(to).size === statSync(from).size
      && readFileSync(to).equals(readFileSync(from));
    if (same) continue;
    if (check) {
      stale.push(`${slug}/public/audio/${file}`);
      continue;
    }
    writeFileSync(to, readFileSync(from));
    copied++;
  }
}

const total = files.reduce((s, f) => s + statSync(join(MASTER, f)).size, 0);
const kb = (total / 1024).toFixed(1);

if (check) {
  if (stale.length) {
    console.error(`✗ Звук не синхронизирован (${stale.length}): ${stale.slice(0, 5).join(', ')}${stale.length > 5 ? '…' : ''}`);
    console.error('  Запустите: npm run audio:sync');
    process.exit(1);
  }
  console.log(`✓ Звук синхронизирован: ${files.length} файлов (${kb} КБ) в ${slugs.length} играх`);
} else {
  console.log(`Звук: ${files.length} файлов (${kb} КБ) → ${slugs.length} игр, обновлено ${copied}`);
}
