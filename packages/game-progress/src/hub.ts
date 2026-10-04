import { readJson, writeJson } from './storage.js';
import { clearedCount, isLadderComplete, loadProgress, nextLevel, totalStars } from './progress.js';
import { loadBests } from './records.js';

/**
 * Данные для хаба каталога (T2 UX-волны): карточка «Продолжить» и строка
 * прогресса под каждой игрой. Хаб — статический HTML, он получает эти функции
 * бандлом `progress.js` (собирается `scripts/build-catalog.mjs`), поэтому
 * правила считаются в одном месте для игр, хаба и выгрузки на сервер.
 */

const LAST_KEY = 'wingo:lastPlayed';

export interface LastPlayed {
  slug: string;
  /** Когда сыграна последняя партия, мс. */
  at: number;
}

/** Запомнить игру последней партии — зовётся из `recordRound` на каждом итоге. */
export function recordLastPlayed(slug: string, at: number = Date.now()): void {
  writeJson(LAST_KEY, { slug, at });
}

/** Последняя сыгранная игра или null, если ещё ничего не сыграно. */
export function getLastPlayed(): LastPlayed | null {
  const raw = readJson<Partial<LastPlayed>>(LAST_KEY);
  if (!raw || typeof raw.slug !== 'string' || !raw.slug) return null;
  return { slug: raw.slug, at: Number(raw.at) || 0 };
}

export type GameKind = 'ladder' | 'arcade';

export interface GameStatus {
  started: boolean;
  /** Лестница: следующий уровень и звёзды. */
  level?: number;
  stars?: number;
  maxStars?: number;
  complete?: boolean;
  /** Аркада: рекорд и закрытые испытания. */
  record?: number;
  challengesDone?: number;
  total: number;
}

/**
 * Строка под игрой в каталоге: у лестницы — «Уровень 7 · ★ 14 / 45», у аркады —
 * «Рекорд 1 240 · испытание 4/15», у неначатой — «Не начато». Испытания аркад
 * хранятся лестницей (испытание n — уровень n), поэтому прогресс читается одинаково.
 */
export function gameStatus(slug: string, kind: GameKind, total = 15, recordMetric = 'score'): GameStatus {
  const progress = loadProgress(slug);
  const cleared = clearedCount(progress);
  if (kind === 'arcade') {
    const bests = loadBests(slug);
    const record = bests[recordMetric] ?? Object.values(bests)[0] ?? 0;
    return { started: record > 0 || cleared > 0, record, challengesDone: cleared, total };
  }
  return {
    started: cleared > 0,
    level: nextLevel(progress, total),
    stars: totalStars(progress),
    maxStars: total * 3,
    complete: isLadderComplete(progress, total),
    total,
  };
}
