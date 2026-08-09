#!/usr/bin/env node
/**
 * Проверка текстов игр каталога: словари RU/UZ и отсутствие хардкода в сценах.
 *
 * Блокеры:
 *  - ключ есть в ru.json, но нет в uz.json (или наоборот);
 *  - пустое значение;
 *  - разный набор подстановок {n} в ru и uz — строка сломается на подстановке;
 *  - дубль ключа в JSON (второй молча затирает первый);
 *  - t(locale, 'ключ') без такого ключа в словаре;
 *  - строковый литерал с кириллицей в сцене — правило «никакого хардкода текста».
 *
 * Предупреждения: ключ в словаре никем не используется; перевод дословно равен русскому.
 *
 *   node .claude/skills/content-pack/scripts/check-content.mjs
 *   node .claude/skills/content-pack/scripts/check-content.mjs quiz jigsaw
 *   node .claude/skills/content-pack/scripts/check-content.mjs --json
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Локали каталога: русский — исходный, узбекский — обязательный перевод. */
const BASE = 'ru';
const LOCALES = ['ru', 'uz'];

/**
 * Где кириллица в литералах законна: словари, контент-паки (вопросы, факты, истории,
 * слова) и тесты, которые этот контент проверяют.
 */
const CONTENT_OK = [
  /[\\/]src[\\/]i18n[\\/]/,
  /[\\/]src[\\/]content[\\/]/,
  /(pictures|words|dictionary|facts|stories)\.ts$/,
  /\.test\.ts$/,
];

/** Значения, совпадение которых в ru и uz — норма, а не забытый перевод. */
const SAME_OK = /^[^А-Яа-яЁё]*$/;

/**
 * Названия языков пишутся на самом языке и не переводятся — на кнопках выбора
 * локали кириллица в коде законна.
 */
const ENDONYMS = new Set(['Русский', 'Oʻzbekcha', 'O‘zbekcha', 'English']);

/** Пометка в строке кода, которая снимает проверку на хардкод. */
const IGNORE = 'i18n-ignore';

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

/**
 * Строковые литералы кода с номерами строк. Свой разбор нужен, чтобы не принимать
 * за текст комментарии (в каталоге они русские) и не спотыкаться о `//` внутри строк.
 */
export function stringLiterals(code) {
  const out = [];
  let line = 1;
  let i = 0;
  // Стек шаблонных литералов: внутри `${ }` мы снова в обычном коде.
  const tpl = [];
  let prev = '';

  const push = (value, at) => {
    if (value) out.push({ value, line: at });
  };

  while (i < code.length) {
    const c = code[i];
    const next = code[i + 1];

    if (c === '\n') { line++; i++; prev = ''; continue; }

    if (c === '/' && next === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
        if (code[i] === '\n') line++;
        i++;
      }
      i += 2;
      continue;
    }
    // Регулярка: `/` после оператора или скобки — не деление.
    if (c === '/' && /[(,=:[!&|?{};+]/.test(prev)) {
      i++;
      while (i < code.length && code[i] !== '/') {
        if (code[i] === '\\') i++;
        if (code[i] === '\n') break;
        i++;
      }
      i++;
      prev = '/';
      continue;
    }

    if (c === "'" || c === '"') {
      const quote = c;
      const at = line;
      let value = '';
      i++;
      while (i < code.length && code[i] !== quote) {
        if (code[i] === '\\') { value += code[i + 1]; i += 2; continue; }
        if (code[i] === '\n') line++;
        value += code[i];
        i++;
      }
      i++;
      push(value, at);
      prev = quote;
      continue;
    }

    if (c === '`') {
      tpl.push({ at: line, value: '' });
      i++;
      while (i < code.length) {
        if (code[i] === '\\') { tpl[tpl.length - 1].value += code[i + 1]; i += 2; continue; }
        if (code[i] === '`') { const done = tpl.pop(); push(done.value, done.at); i++; break; }
        if (code[i] === '$' && code[i + 1] === '{') {
          // Выражение внутри подстановки разбирается как обычный код.
          tpl[tpl.length - 1].value += '${}';
          i += 2;
          let depth = 1;
          const start = i;
          while (i < code.length && depth > 0) {
            if (code[i] === '{') depth++;
            else if (code[i] === '}') depth--;
            else if (code[i] === '\n') line++;
            i++;
          }
          for (const lit of stringLiterals(code.slice(start, i - 1))) push(lit.value, line);
          continue;
        }
        if (code[i] === '\n') line++;
        tpl[tpl.length - 1].value += code[i];
        i++;
      }
      prev = '`';
      continue;
    }

    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

/** Набор подстановок {name} в строке. */
const placeholders = (s) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));

/** Ключи, объявленные в JSON дважды: JSON.parse оставит последний и промолчит. */
function duplicateKeys(raw) {
  const seen = new Set();
  const dupes = [];
  for (const m of raw.matchAll(/^\s*"([^"]+)"\s*:/gm)) {
    if (seen.has(m[1])) dupes.push(m[1]);
    seen.add(m[1]);
  }
  return dupes;
}

const gamesDir = join(ROOT, 'games');
const slugs = readdirSync(gamesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((slug) => (only.length ? only.includes(slug) : true))
  .sort();

const report = [];

for (const slug of slugs) {
  const gameDir = join(gamesDir, slug);
  const i18nDir = join(gameDir, 'src/i18n');
  const errors = [];
  const warnings = [];

  if (!existsSync(i18nDir)) {
    report.push({ slug, errors: ['нет папки src/i18n'], warnings: [], keys: 0 });
    continue;
  }

  const dicts = {};
  for (const loc of LOCALES) {
    const file = join(i18nDir, `${loc}.json`);
    if (!existsSync(file)) {
      errors.push(`нет словаря ${loc}.json`);
      continue;
    }
    const raw = readFileSync(file, 'utf8');
    for (const key of duplicateKeys(raw)) errors.push(`${loc}.json: ключ «${key}» объявлен дважды`);
    try {
      dicts[loc] = JSON.parse(raw);
    } catch (e) {
      errors.push(`${loc}.json не парсится: ${e.message}`);
    }
  }

  const base = dicts[BASE] ?? {};
  const baseKeys = Object.keys(base);

  for (const loc of LOCALES) {
    const dict = dicts[loc];
    if (!dict) continue;
    for (const key of baseKeys) {
      if (!(key in dict)) {
        errors.push(`${loc}.json: нет ключа «${key}»`);
        continue;
      }
      const value = String(dict[key]);
      if (!value.trim()) errors.push(`${loc}.json: пустое значение у «${key}»`);
      const a = placeholders(String(base[key]));
      const b = placeholders(value);
      if (a.size !== b.size || [...a].some((p) => !b.has(p))) {
        const show = (set) => (set.size ? [...set].map((p) => `{${p}}`).join(', ') : '—');
        errors.push(`${loc}.json: подстановки у «${key}» не совпадают: в ${BASE} ${show(a)}, здесь ${show(b)}`);
      }
      if (loc !== BASE && value === String(base[key]) && !SAME_OK.test(value)) {
        warnings.push(`${loc}.json: «${key}» дословно равен русскому — перевод забыт?`);
      }
    }
    for (const key of Object.keys(dict)) {
      if (!(key in base)) errors.push(`${loc}.json: лишний ключ «${key}», которого нет в ${BASE}.json`);
    }
  }

  // Использование ключей в коде.
  const sources = walk(join(gameDir, 'src')).filter((f) => f.endsWith('.ts') && !f.includes(`${'src'}/i18n/`));
  const used = new Set();
  const prefixes = new Set();

  for (const file of sources) {
    const code = readFileSync(file, 'utf8');
    const rel = relative(ROOT, file);

    // t(locale, 'ключ') — прямое обращение; ключа может не быть в словаре.
    for (const m of code.matchAll(/\bt\(\s*[^,()]+,\s*['"`]([^'"`$]+)['"`]/g)) {
      used.add(m[1]);
      if (!(m[1] in base)) errors.push(`${rel}: t(..., '${m[1]}') — нет такого ключа в ${BASE}.json`);
    }
    // t(locale, `префикс.${...}`) — динамический ключ, считаем занятым весь префикс.
    for (const m of code.matchAll(/\bt\(\s*[^,()]+,\s*`([^`]*?)\$\{/g)) prefixes.add(m[1]);

    const literals = stringLiterals(code);
    for (const lit of literals) if (lit.value in base) used.add(lit.value);

    if (!CONTENT_OK.some((re) => re.test(file))) {
      const lines = code.split('\n');
      for (const lit of literals) {
        if (!/[А-Яа-яЁё]{2,}/.test(lit.value)) continue;
        if (ENDONYMS.has(lit.value.trim())) continue;
        if ((lines[lit.line - 1] ?? '').includes(IGNORE)) continue;
        errors.push(`${rel}:${lit.line}: текст в коде «${lit.value.slice(0, 48)}» — вынести в словарь`);
      }
    }
  }

  for (const key of baseKeys) {
    if (used.has(key)) continue;
    if ([...prefixes].some((p) => key.startsWith(p))) continue;
    warnings.push(`${BASE}.json: ключ «${key}» нигде не используется`);
  }

  report.push({ slug, errors, warnings, keys: baseKeys.length });
}

const failed = report.filter((r) => r.errors.length);

if (asJson) {
  console.log(JSON.stringify({ locales: LOCALES, report }, null, 2));
} else {
  console.log(`Словари: ${LOCALES.join(', ')} · игр: ${report.length}\n`);
  for (const r of report) {
    const mark = r.errors.length ? '✗' : r.warnings.length ? '!' : '✓';
    console.log(`${mark} ${r.slug} — ${r.keys} ключей`);
    for (const e of r.errors) console.log(`    ✗ ${e}`);
    for (const w of r.warnings) console.log(`    ! ${w}`);
  }
  console.log(failed.length
    ? `\n✗ Блокеры в: ${failed.map((r) => r.slug).join(', ')}`
    : '\n✓ Блокеров нет');
}

process.exit(failed.length ? 1 : 0);
