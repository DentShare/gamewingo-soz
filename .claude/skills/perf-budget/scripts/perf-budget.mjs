#!/usr/bin/env node
/**
 * Бюджет производительности каталога: вес прод-билдов игр и хаба.
 *
 * Железное правило №7 из CLAUDE.md: билд игры < 5 МБ, цель < 2 МБ. Скрипт меряет
 * распакованный вес и вес по gzip (именно его получает телефон), показывает самые
 * тяжёлые файлы и возвращает код 1 при превышении жёсткого лимита — годится для CI.
 *
 *   node .claude/skills/perf-budget/scripts/perf-budget.mjs
 *   node .claude/skills/perf-budget/scripts/perf-budget.mjs quiz jigsaw
 *   node .claude/skills/perf-budget/scripts/perf-budget.mjs --json
 */
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Лимиты каталога, МБ. */
const HARD_LIMIT_MB = 5;
const TARGET_MB = 2;

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const only = args.filter((a) => !a.startsWith('--'));

/** Все файлы каталога рекурсивно. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

const mb = (bytes) => bytes / 1024 / 1024;
const fmt = (bytes) => `${mb(bytes).toFixed(2)} МБ`;

/** Замер одной сборки: вес, gzip и три самых тяжёлых файла. */
function measure(name, dist) {
  const files = walk(dist).map((path) => {
    const raw = readFileSync(path);
    return {
      path: relative(dist, path),
      bytes: raw.length,
      // gzip меряем только для того, что реально сжимается на лету.
      gzip: /\.(js|css|html|json|svg|txt)$/i.test(path) ? gzipSync(raw).length : raw.length,
    };
  });
  const bytes = files.reduce((s, f) => s + f.bytes, 0);
  const gzip = files.reduce((s, f) => s + f.gzip, 0);
  const heaviest = [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 3);
  return {
    name,
    bytes,
    gzip,
    heaviest,
    overHard: mb(bytes) > HARD_LIMIT_MB,
    overTarget: mb(bytes) > TARGET_MB,
  };
}

// Что меряем: все игры из games/ (кроме служебных файлов) плюс хаб в dist-all.
const gamesDir = join(ROOT, 'games');
const slugs = readdirSync(gamesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((slug) => (only.length ? only.includes(slug) : true))
  .sort();

const results = [];
const missing = [];

for (const slug of slugs) {
  const dist = join(gamesDir, slug, 'dist');
  if (!existsSync(join(dist, 'index.html'))) {
    missing.push(slug);
    continue;
  }
  results.push(measure(slug, dist));
}

// Хаб меряем отдельно: он собирается в корень домена и грузится первым.
if (!only.length) {
  const hub = join(ROOT, 'dist-all');
  if (existsSync(join(hub, 'index.html'))) {
    const files = walk(hub).filter((f) => !slugs.some((s) => f.includes(`${hub}/${s}/`)));
    const bytes = files.reduce((s, f) => s + statSync(f).size, 0);
    results.push({
      name: 'хаб (корень домена)', bytes, gzip: bytes, heaviest: [],
      overHard: mb(bytes) > HARD_LIMIT_MB, overTarget: mb(bytes) > TARGET_MB,
    });
  }
}

if (asJson) {
  console.log(JSON.stringify({ hardLimitMb: HARD_LIMIT_MB, targetMb: TARGET_MB, missing, results }, null, 2));
} else {
  console.log(`Бюджет: жёсткий лимит ${HARD_LIMIT_MB} МБ, цель ${TARGET_MB} МБ\n`);
  const pad = Math.max(...results.map((r) => r.name.length), 10);
  for (const r of results) {
    const mark = r.overHard ? '✗' : r.overTarget ? '!' : '✓';
    console.log(`${mark} ${r.name.padEnd(pad)}  ${fmt(r.bytes).padStart(9)}  gzip ${fmt(r.gzip).padStart(9)}`);
  }
  const worst = results.filter((r) => r.overTarget).sort((a, b) => b.bytes - a.bytes);
  if (worst.length) {
    console.log('\nСамые тяжёлые файлы там, где вес выше цели:');
    for (const r of worst) {
      console.log(`  ${r.name}:`);
      for (const f of r.heaviest) console.log(`    ${fmt(f.bytes).padStart(9)}  ${f.path}`);
    }
  }
  if (missing.length) {
    console.log(`\nНе собраны (запустите npm run build:all): ${missing.join(', ')}`);
  }
  const over = results.filter((r) => r.overHard);
  console.log(over.length
    ? `\n✗ Превышен жёсткий лимит: ${over.map((r) => r.name).join(', ')}`
    : '\n✓ Все сборки в пределах жёсткого лимита');
}

process.exit(results.some((r) => r.overHard) ? 1 : 0);
