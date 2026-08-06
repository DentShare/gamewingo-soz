/**
 * Выгрузка конфигов прогрессии для Score Engine (FastAPI).
 *
 * Собирает из монорепо один пакет правды для сервера:
 *  - правила начисления, звёзд, заданий и антифрода — из GAME_CONFIGS
 *    (@gamewingo/game-progress, требует собранного dist);
 *  - реальные лестницы уровней — бандлит games/<slug>/src/core/levels.ts
 *    esbuild-ом и читает LADDER, чтобы у сервера были те же 15 уровней,
 *    что видит игрок, без ручного дублирования;
 *  - потолок очков — MAX_SCORE / SCORE_CAP из games/<slug>/src/core/score.ts,
 *    если игра его объявляет; иначе остаётся значение конфига;
 *  - экономику каталога (тарифы кошелька, задания дня, достижения) — catalog.json.
 *
 * Запуск: npm run progression:export  (сначала соберёт общие пакеты).
 * Результат: backend/app/progression/configs/<gameId>.json + catalog.json.
 */
import { build } from 'esbuild';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'backend/app/progression/configs');

const { GAME_CONFIGS, CATALOG_ECONOMY } = await import(
  pathToFileURL(join(root, 'packages/game-progress/dist/config/index.js')).href
);

/** Бандлит TS-модуль игры и возвращает его экспорты. */
async function importGameModule(workDir, entry) {
  if (!existsSync(entry)) return null;
  const outfile = join(workDir, `${Math.random().toString(36).slice(2)}.mjs`);
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    logLevel: 'silent',
  });
  return import(pathToFileURL(outfile).href);
}

const workDir = await mkdtemp(join(tmpdir(), 'wingo-progression-'));
await mkdir(outDir, { recursive: true });

try {
  let exported = 0;
  for (const [gameId, config] of Object.entries(GAME_CONFIGS)) {
    const coreDir = join(root, 'games', gameId, 'src/core');

    const levelsModule = await importGameModule(workDir, join(coreDir, 'levels.ts'));
    if (!levelsModule?.LADDER?.length) {
      throw new Error(`У игры ${gameId} не нашлась лестница LADDER в src/core/levels.ts`);
    }
    const levels = levelsModule.LADDER.map(({ n, params, goals }) => ({ n, params, goals }));

    const scoreModule = await importGameModule(workDir, join(coreDir, 'score.ts'));
    const scoreCap = scoreModule?.MAX_SCORE ?? scoreModule?.SCORE_CAP;
    const antiFraud = typeof scoreCap === 'number'
      ? { ...config.antiFraud, maxScorePerSession: scoreCap }
      : config.antiFraud;

    const full = { ...config, levels, antiFraud };
    await writeFile(join(outDir, `${gameId}.json`), `${JSON.stringify(full, null, 2)}\n`);
    console.log(`✔ ${gameId}: ${levels.length} уровней, потолок очков ${antiFraud.maxScorePerSession}`);
    exported += 1;
  }

  await writeFile(join(outDir, 'catalog.json'), `${JSON.stringify(CATALOG_ECONOMY, null, 2)}\n`);
  console.log(`✔ catalog: тарифы кошелька, задания дня, достижения каталога`);
  console.log(`Экспортировано ${exported} игровых конфигов → ${outDir}`);
} finally {
  await rm(workDir, { recursive: true, force: true });
}
