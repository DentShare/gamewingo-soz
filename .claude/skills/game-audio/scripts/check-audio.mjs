#!/usr/bin/env node
/**
 * Проверка звука в играх каталога: вес, формат, лицензии и обязательная обвязка.
 *
 * Что считается блокером:
 *  - несжатый формат (.wav/.aiff) в билде;
 *  - аудио одной игры тяжелее AUDIO_BUDGET_KB;
 *  - аудиофайл без строки в docs/LICENSES.md;
 *  - игра со звуком без разблокировки по жесту (iOS промолчит) или без выключателя.
 *
 *   node .claude/skills/game-audio/scripts/check-audio.mjs
 *   node .claude/skills/game-audio/scripts/check-audio.mjs quiz jigsaw
 *   node .claude/skills/game-audio/scripts/check-audio.mjs --json
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Весь звук одной игры вместе с музыкой, КБ. */
const AUDIO_BUDGET_KB = 300;
/** Один эффект: длиннее — почти всегда несжатый или слишком длинный. */
const ONE_FILE_LIMIT_KB = 120;

const PLAYABLE = new Set(['.m4a', '.aac', '.mp3', '.ogg', '.opus', '.webm']);
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

const gamesDir = join(ROOT, 'games');
const slugs = readdirSync(gamesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((slug) => (only.length ? only.includes(slug) : true))
  .sort();

const report = [];

for (const slug of slugs) {
  const gameDir = join(gamesDir, slug);
  const synthPath = join(gameDir, 'src/game/audio.ts');
  const sources = walk(join(gameDir, 'src'));
  const src = sources.map((f) => readFileSync(f, 'utf8')).join('\n');
  // Обвязку ищем во всём, кроме самого слоя: иначе его собственные объявления
  // `unlockAudio` и `setMuted` выдали бы себя за подключение.
  const wired = sources
    .filter((f) => f !== synthPath)
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');

  const files = [...walk(join(gameDir, 'public')), ...walk(join(gameDir, 'src'))]
    .filter((f) => PLAYABLE.has(extname(f).toLowerCase()) || UNCOMPRESSED.has(extname(f).toLowerCase()))
    .map((f) => ({ path: relative(gameDir, f), bytes: statSync(f).size, ext: extname(f).toLowerCase() }));

  const hasSynth = existsSync(synthPath);
  const usesSound = hasSynth || files.length > 0 || /playSound\(|sound\.play\(/.test(src);
  if (!usesSound) {
    report.push({ slug, silent: true, files: [], bytes: 0, errors: [], warnings: [] });
    continue;
  }

  const errors = [];
  const warnings = [];
  const bytes = files.reduce((s, f) => s + f.bytes, 0);

  for (const f of files) {
    if (UNCOMPRESSED.has(f.ext)) {
      errors.push(`несжатый формат: ${f.path} (${fmt(f.bytes)}) — пересобрать в .m4a/.ogg`);
    } else if (kb(f.bytes) > ONE_FILE_LIMIT_KB) {
      warnings.push(`тяжёлый файл: ${f.path} (${fmt(f.bytes)}) — моно, 64–96 kbps?`);
    }
    // Реестр лицензий ищем по имени файла: строка про пак обычно называет файлы или папку.
    const name = basename(f.path);
    const folder = dirname(f.path).split('/').pop();
    if (!licenses.includes(name) && !(folder && licenses.includes(folder))) {
      errors.push(`нет строки в docs/LICENSES.md: ${f.path}`);
    }
  }

  if (kb(bytes) > AUDIO_BUDGET_KB) {
    errors.push(`бюджет звука превышен: ${fmt(bytes)} > ${AUDIO_BUDGET_KB} КБ`);
  }

  // Обвязка: без жеста iOS молчит, без выключателя игру нельзя открыть в приложении.
  if (!/installAudioUnlock\(|unlockAudio\(|context\.resume\(|sound\.unlock/.test(wired)) {
    errors.push('нет разблокировки по жесту (installAudioUnlock в main.ts) — в iOS WebView звука не будет');
  }
  if (!/setMuted\(|toggleMute\(|sound\.mute/.test(wired)) {
    errors.push('нет выключателя звука в меню игры');
  }
  if (hasSynth && !readFileSync(synthPath, 'utf8').includes('wingo:sound')) {
    warnings.push('слой синтеза без общего ключа wingo:sound — состояние не разделяется с каталогом');
  }

  report.push({ slug, silent: false, files, bytes, errors, warnings });
}

const withSound = report.filter((r) => !r.silent);
const failed = withSound.filter((r) => r.errors.length);

if (asJson) {
  console.log(JSON.stringify({ audioBudgetKb: AUDIO_BUDGET_KB, report }, null, 2));
} else {
  const silent = report.filter((r) => r.silent).map((r) => r.slug);
  console.log(`Бюджет звука на игру: ${AUDIO_BUDGET_KB} КБ\n`);
  if (!withSound.length) {
    console.log('Игр со звуком нет.');
    console.log(`Без звука (${silent.length}): ${silent.join(', ')}`);
    console.log('\nПодключить синтез: см. .claude/skills/game-audio/SKILL.md, раздел 1.');
  } else {
    for (const r of withSound) {
      const mark = r.errors.length ? '✗' : r.warnings.length ? '!' : '✓';
      const weight = r.files.length ? `${fmt(r.bytes)} в ${r.files.length} файл(ах)` : 'синтез, 0 байт';
      console.log(`${mark} ${r.slug} — ${weight}`);
      for (const e of r.errors) console.log(`    ✗ ${e}`);
      for (const w of r.warnings) console.log(`    ! ${w}`);
    }
    if (silent.length) console.log(`\nБез звука (${silent.length}): ${silent.join(', ')}`);
  }
  console.log(failed.length
    ? `\n✗ Блокеры в: ${failed.map((r) => r.slug).join(', ')}`
    : '\n✓ Блокеров нет');
}

process.exit(failed.length ? 1 : 0);
