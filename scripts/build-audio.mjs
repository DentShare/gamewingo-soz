#!/usr/bin/env node
/**
 * Зашить звуковой пак в дизайн-систему.
 *
 * Раньше восемь mp3 лежали в `public/` каждой игры и качались отдельными
 * запросами после первого касания. Внутри WebView это лишний класс отказов:
 * нет сети — нет звука, странный базовый путь — нет звука, строгий CSP — нет
 * звука, и всё молча. Теперь пак живёт строкой base64 внутри бандла: звучит
 * офлайн и с первого же касания.
 *
 * Цена — примерно +9 КБ на игру (base64 на треть длиннее двоичных данных),
 * но по gzip разница почти исчезает: сжатый mp3 плохо сжимается в любом виде.
 *
 *   node scripts/build-audio.mjs           # перегенерировать модуль
 *   node scripts/build-audio.mjs --check   # убедиться, что он не отстал от пака
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACK = join(ROOT, 'packages/game-ui/audio');
const TARGET = join(ROOT, 'packages/game-ui/src/audioData.ts');
// Страница диагностики — обычный HTML без бандла игры, поэтому ей нужен
// тот же пак отдельным модулем. Источник один, копий в исходниках нет.
const HUB_TARGET = join(ROOT, 'hub/audio-data.js');

const check = process.argv.includes('--check');

if (!existsSync(PACK)) {
  console.error(`Нет пака: ${PACK}`);
  process.exit(2);
}

const files = readdirSync(PACK).filter((f) => f.endsWith('.mp3')).sort();
if (!files.length) {
  console.error('В паке нет .mp3');
  process.exit(2);
}

const entries = files.map((file) => {
  const raw = readFileSync(join(PACK, file));
  return { name: basename(file, '.mp3'), base64: raw.toString('base64'), bytes: raw.length };
});

const bytes = entries.reduce((s, e) => s + e.bytes, 0);
const encoded = entries.reduce((s, e) => s + e.base64.length, 0);

const body = `/**
 * Звуковой пак каталога в виде base64 — СГЕНЕРИРОВАНО \`scripts/build-audio.mjs\`.
 * Руками не править: перезапишется при следующей сборке пака.
 *
 * Почему в бандле, а не файлами: внутри WebView отдельный запрос за звуком —
 * это лишний класс отказов (нет сети, чужой базовый путь, строгий CSP), и все
 * они молчаливые. Источник — \`packages/game-ui/audio/*.mp3\`, лицензия CC0,
 * строка в \`docs/LICENSES.md\`.
 *
 * Пак: ${entries.length} звук(ов), ${(bytes / 1024).toFixed(1)} КБ в mp3, ${(encoded / 1024).toFixed(1)} КБ в base64.
 */
export const AUDIO_DATA: Readonly<Record<string, string>> = {
${entries.map((e) => `  ${e.name}: '${e.base64}',`).join('\n')}
};
`;

const hubBody = `// Звуковой пак для страницы диагностики — СГЕНЕРИРОВАНО \`scripts/build-audio.mjs\`.
// Тот же источник, что и у игр: packages/game-ui/audio/*.mp3 (CC0).
export const AUDIO_DATA = {
${entries.map((e) => `  ${e.name}: '${e.base64}',`).join('\n')}
};
`;

if (check) {
  const stale = [
    [TARGET, body],
    [HUB_TARGET, hubBody],
  ].filter(([file, want]) => (existsSync(file) ? readFileSync(file, 'utf8') : '') !== want);
  if (stale.length) {
    console.error(`✗ Отстали от пака: ${stale.map(([f]) => basename(f)).join(', ')} — запустите npm run audio:build`);
    process.exit(1);
  }
  console.log(`✓ Звук в бандле актуален: ${entries.length} шт., ${(encoded / 1024).toFixed(1)} КБ base64`);
} else {
  writeFileSync(TARGET, body, 'utf8');
  writeFileSync(HUB_TARGET, hubBody, 'utf8');
  console.log(`Звук зашит в бандл: ${entries.length} шт., ${(bytes / 1024).toFixed(1)} КБ → ${(encoded / 1024).toFixed(1)} КБ base64`);
}
