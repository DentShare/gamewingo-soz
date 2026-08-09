#!/usr/bin/env node
/**
 * Подготовка растровых ассетов для игр каталога: размер, формат, вес, лицензия.
 *
 * Берёт файл или папку с картинками, ужимает по длинной стороне (без апскейла),
 * перегоняет в webp (или png по флагу), пишет в целевую папку с сохранением структуры
 * и печатает отчёт «было — стало» плюс шаблон строки для docs/LICENSES.md.
 *
 *   node .claude/skills/asset-pipeline/scripts/prepare-assets.mjs <вход> [выход] [флаги]
 *
 * Флаги:
 *   --max=512      максимум по длинной стороне, px (по умолчанию 512)
 *   --quality=80   качество webp/png, 1…100
 *   --square       дополнить прозрачными полями до квадрата max × max
 *   --png          писать png вместо webp
 *   --dry          ничего не записывать, только посчитать
 *   --json         машинный вывод
 *
 * Требуется sharp: npm i -D sharp --no-save
 */
import { readdirSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, relative, extname, basename, resolve } from 'node:path';

const RASTER = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.tiff', '.bmp']);

const argv = process.argv.slice(2);
const flags = Object.fromEntries(
  argv.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const positional = argv.filter((a) => !a.startsWith('--'));

const MAX = Number(flags.max ?? 512);
const QUALITY = Number(flags.quality ?? 80);
const SQUARE = Boolean(flags.square);
const FORMAT = flags.png ? 'png' : 'webp';
const DRY = Boolean(flags.dry);
const AS_JSON = Boolean(flags.json);

if (!positional.length) {
  console.error('Укажите вход: node prepare-assets.mjs <файл-или-папка> [папка-выхода] [--max=512]');
  process.exit(2);
}

const input = resolve(positional[0]);
if (!existsSync(input)) {
  console.error(`Нет такого пути: ${input}`);
  process.exit(2);
}
const inputIsDir = statSync(input).isDirectory();
const outDir = positional[1]
  ? resolve(positional[1])
  : join(inputIsDir ? input : dirname(input), 'prepared');

let sharp;
try {
  ({ default: sharp } = await import('sharp'));
} catch {
  console.error('Нет sharp. Установите разово, без записи в package.json:\n\n  npm i -D sharp --no-save\n');
  process.exit(2);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

const all = inputIsDir ? walk(input) : [input];
const skippedSvg = all.filter((f) => extname(f).toLowerCase() === '.svg');
const files = all.filter((f) => RASTER.has(extname(f).toLowerCase()));

if (!files.length) {
  console.error(`Растровых картинок не найдено в ${input}`);
  if (skippedSvg.length) console.error(`(есть ${skippedSvg.length} .svg — вектор каталог не трогает)`);
  process.exit(2);
}

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} КБ`;
/** Короткий путь, если он внутри проекта, иначе абсолютный — «../../../tmp» никому не помогает. */
const shortPath = (p) => {
  const rel = relative(process.cwd(), p);
  return !rel || rel.startsWith('..') ? p : rel;
};
const rows = [];

for (const file of files) {
  const rel = inputIsDir ? relative(input, file) : basename(file);
  const target = join(outDir, rel.replace(/\.[^.]+$/, `.${FORMAT}`));
  const before = statSync(file).size;

  let pipe = sharp(file).rotate(); // rotate() без аргументов применяет EXIF-ориентацию

  const meta = await pipe.metadata();
  const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
  // Апскейл запрещён: увеличенная картинка тяжелее и не чётче.
  if (longest > MAX) pipe = pipe.resize({ width: MAX, height: MAX, fit: 'inside' });

  if (SQUARE) {
    pipe = pipe.resize({
      width: MAX, height: MAX, fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }

  pipe = FORMAT === 'webp'
    ? pipe.webp({ quality: QUALITY })
    : pipe.png({ quality: QUALITY, compressionLevel: 9, palette: true });

  const buf = await pipe.toBuffer();
  if (!DRY) {
    mkdirSync(dirname(target), { recursive: true });
    await sharp(buf).toFile(target);
  }

  const out = await sharp(buf).metadata();
  rows.push({
    from: rel,
    to: shortPath(target),
    before,
    after: buf.length,
    size: `${out.width}×${out.height}`,
    wasSize: `${meta.width}×${meta.height}`,
  });
}

const before = rows.reduce((s, r) => s + r.before, 0);
const after = rows.reduce((s, r) => s + r.after, 0);
const saved = before ? Math.round((1 - after / before) * 100) : 0;

if (AS_JSON) {
  console.log(JSON.stringify({ outDir, format: FORMAT, max: MAX, quality: QUALITY, dry: DRY, before, after, rows }, null, 2));
  process.exit(0);
}

console.log(`${DRY ? 'Пробный прогон. ' : ''}${FORMAT}, максимум ${MAX} px, качество ${QUALITY}${SQUARE ? ', квадрат' : ''}`);
console.log(`Выход: ${shortPath(outDir)}\n`);

const pad = Math.max(...rows.map((r) => r.from.length), 6);
for (const r of rows) {
  const delta = r.before ? `−${Math.round((1 - r.after / r.before) * 100)}%` : '';
  console.log(
    `  ${r.from.padEnd(pad)}  ${r.wasSize.padStart(9)} → ${r.size.padEnd(9)}  ` +
    `${kb(r.before).padStart(8)} → ${kb(r.after).padStart(8)}  ${delta}`,
  );
}

console.log(`\n  Итого: ${kb(before)} → ${kb(after)} (−${saved}%), файлов: ${rows.length}`);
if (skippedSvg.length) console.log(`  Пропущено .svg: ${skippedSvg.length} — вектор остаётся вектором`);
if (after / 1024 / 1024 > 1) {
  console.log('  ! Больше 1 МБ на пак — при бюджете игры 2 МБ это много, снизьте --max или --quality');
}

console.log(`
Строка для docs/LICENSES.md (заполнить источник и лицензию до коммита файлов):

| <игра> | Ассеты: ${basename(input)} (${rows.length} файлов, ${kb(after)}) | <источник/URL> | <лицензия> | <атрибуция нужна?> |
`);

if (DRY) console.log('Пробный прогон — файлы не записаны. Уберите --dry, чтобы записать.');
