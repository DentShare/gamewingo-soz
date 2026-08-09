#!/usr/bin/env node
/**
 * Проверка звука каталога: пак, его сборка в бандл, лицензии и обвязка игр.
 *
 * Что считается блокером:
 *  - в мастер-паке нет нужного звука или он в несжатом формате;
 *  - пак тяжелее бюджета;
 *  - сгенерированный модуль отстал от пака (звук в билде будет старым);
 *  - пак не записан в docs/LICENSES.md;
 *  - игра со звуком без разблокировки по жесту или без выключателя;
 *  - аудиофайлы, забытые в `games/<slug>/public` — пак живёт в бандле,
 *    отдельные файлы означают лишний запрос и рассинхрон.
 *
 *   node .claude/skills/game-audio/scripts/check-audio.mjs
 *   node .claude/skills/game-audio/scripts/check-audio.mjs quiz jigsaw
 *   node .claude/skills/game-audio/scripts/check-audio.mjs --json
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Общая мастер-копия пака и сгенерированный из неё модуль. */
const PACK = 'packages/game-ui/audio';
const GENERATED = 'packages/game-ui/src/audioData.ts';

/** Восемь имён, которые обязана знать дизайн-система. */
const REQUIRED = ['tap', 'ok', 'wrong', 'win', 'lose', 'coin', 'star', 'swipe'];

/** Весь пак вместе с музыкой, КБ. Дальше растёт вес каждой игры разом. */
const PACK_BUDGET_KB = 300;
/** Один эффект: длиннее — почти всегда несжатый или слишком длинный. */
const ONE_FILE_LIMIT_KB = 120;

const COMPRESSED = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.webm']);
const UNCOMPRESSED = new Set(['.wav', '.aiff', '.aif', '.flac']);

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const only = args.filter((a) => !a.startsWith('--'));

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

const kb = (bytes) => bytes / 1024;
const fmt = (bytes) => `${kb(bytes).toFixed(0)} КБ`;

const licenses = existsSync(join(ROOT, 'docs/LICENSES.md'))
  ? readFileSync(join(ROOT, 'docs/LICENSES.md'), 'utf8')
  : '';

// --- 1. Мастер-пак -------------------------------------------------------

const packErrors = [];
const packWarnings = [];
const packFiles = walk(join(ROOT, PACK))
  .filter((f) => COMPRESSED.has(extname(f).toLowerCase()) || UNCOMPRESSED.has(extname(f).toLowerCase()))
  .map((f) => ({ name: basename(f, extname(f)), ext: extname(f).toLowerCase(), bytes: statSync(f).size }));

const packBytes = packFiles.reduce((s, f) => s + f.bytes, 0);
const have = new Set(packFiles.map((f) => f.name));

for (const name of REQUIRED) {
  if (!have.has(name)) packErrors.push(`в паке нет звука «${name}»`);
}
for (const f of packFiles) {
  if (UNCOMPRESSED.has(f.ext)) {
    packErrors.push(`несжатый формат: ${f.name}${f.ext} — пересобрать в mp3`);
  } else if (f.ext !== '.mp3') {
    packWarnings.push(`${f.name}${f.ext}: iOS и открытые сборки Chromium надёжно играют только mp3`);
  }
  if (kb(f.bytes) > ONE_FILE_LIMIT_KB) {
    packWarnings.push(`тяжёлый файл: ${f.name}${f.ext} (${fmt(f.bytes)}) — моно, 64–96 kbps?`);
  }
}
if (kb(packBytes) > PACK_BUDGET_KB) {
  packErrors.push(`бюджет пака превышен: ${fmt(packBytes)} > ${PACK_BUDGET_KB} КБ`);
}
if (!licenses.includes(PACK)) {
  packErrors.push(`пак не записан в docs/LICENSES.md (ожидается упоминание ${PACK})`);
}

// Сгенерированный модуль обязан соответствовать паку — иначе в билд уедет старый звук.
if (!existsSync(join(ROOT, GENERATED))) {
  packErrors.push(`нет ${GENERATED} — запустите npm run audio:build`);
} else {
  try {
    execFileSync('node', [join(ROOT, 'scripts/build-audio.mjs'), '--check'], { stdio: 'pipe' });
  } catch {
    packErrors.push(`${GENERATED} отстал от пака — запустите npm run audio:build`);
  }
}

// --- 2. Игры -------------------------------------------------------------

const gamesDir = join(ROOT, 'games');
const slugs = readdirSync(gamesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((slug) => (only.length ? only.includes(slug) : true))
  .sort();

const report = [];

for (const slug of slugs) {
  const gameDir = join(gamesDir, slug);
  const sources = walk(join(gameDir, 'src'));
  const src = sources.map((f) => readFileSync(f, 'utf8')).join('\n');
  const errors = [];
  const warnings = [];

  if (!/playSound\(/.test(src)) {
    report.push({ slug, silent: true, errors, warnings });
    continue;
  }

  if (!/installAudioUnlock\(/.test(src)) {
    errors.push('нет installAudioUnlock() в main.ts — в iOS WebView звука не будет');
  }
  if (!/makeSoundToggle\(|setMuted\(/.test(src)) {
    errors.push('нет выключателя звука в меню (makeSoundToggle из @gamewingo/game-ui)');
  }

  const strays = walk(join(gameDir, 'public'))
    .filter((f) => COMPRESSED.has(extname(f).toLowerCase()) || UNCOMPRESSED.has(extname(f).toLowerCase()));
  for (const f of strays) {
    errors.push(`лишний аудиофайл в public: ${relative(gameDir, f)} — пак живёт в бандле`);
  }

  report.push({ slug, silent: false, errors, warnings });
}

const withSound = report.filter((r) => !r.silent);
const failed = withSound.filter((r) => r.errors.length);
const broken = failed.length || packErrors.length;

if (asJson) {
  console.log(JSON.stringify({
    packBudgetKb: PACK_BUDGET_KB,
    pack: { bytes: packBytes, files: packFiles, errors: packErrors, warnings: packWarnings },
    games: report,
  }, null, 2));
} else {
  const mark = packErrors.length ? '✗' : packWarnings.length ? '!' : '✓';
  console.log(`${mark} Пак: ${packFiles.length} звук(ов), ${fmt(packBytes)} → в бандле каждой игры`);
  for (const e of packErrors) console.log(`    ✗ ${e}`);
  for (const w of packWarnings) console.log(`    ! ${w}`);

  console.log('');
  for (const r of withSound) {
    const m = r.errors.length ? '✗' : r.warnings.length ? '!' : '✓';
    console.log(`${m} ${r.slug}`);
    for (const e of r.errors) console.log(`    ✗ ${e}`);
    for (const w of r.warnings) console.log(`    ! ${w}`);
  }
  const silent = report.filter((r) => r.silent).map((r) => r.slug);
  if (silent.length) console.log(`\nБез звука (${silent.length}): ${silent.join(', ')}`);

  console.log(broken
    ? `\n✗ Блокеры${failed.length ? ` в: ${failed.map((r) => r.slug).join(', ')}` : ' в паке'}`
    : '\n✓ Блокеров нет');
}

process.exit(broken ? 1 : 0);
