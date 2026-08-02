import { readJson, writeJson } from './storage.js';
import type { Stars } from './ladder.js';

/**
 * Прогресс игрока по одной игре. Индекс в массивах — номер уровня минус один.
 * Ноль звёзд означает «уровень ещё не пройден»: пройденный уровень всегда даёт минимум одну.
 */
export interface Progress {
  stars: number[];
  best: number[];
}

export const EMPTY_PROGRESS: Progress = { stars: [], best: [] };

function key(slug: string): string {
  return `${slug}:ladder`;
}

/** Приводит прочитанное к валидной форме: чужие ключи и битый JSON не должны ронять игру. */
function sanitize(raw: unknown): Progress {
  const p = raw as Partial<Progress> | null;
  const nums = (a: unknown): number[] =>
    Array.isArray(a) ? a.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)) : [];
  return { stars: nums(p?.stars), best: nums(p?.best) };
}

export function loadProgress(slug: string): Progress {
  return sanitize(readJson(key(slug)));
}

export function saveProgress(slug: string, progress: Progress): void {
  writeJson(key(slug), progress);
}

export interface RecordResult {
  progress: Progress;
  /** Звёзд стало больше, чем было за этот уровень. */
  improvedStars: boolean;
  /** Счёт побил прежний рекорд уровня. */
  isRecord: boolean;
  /** Уровень пройден впервые — открылся следующий. */
  unlockedNext: boolean;
}

/**
 * Записывает прохождение уровня. Звёзды и рекорд только растут: перепройденный
 * уровень не должен отбирать у игрока уже заработанное.
 */
export function recordLevel(slug: string, n: number, stars: Stars, score: number): RecordResult {
  const progress = loadProgress(slug);
  const i = n - 1;
  const prevStars = progress.stars[i] ?? 0;
  const prevBest = progress.best[i] ?? 0;

  // Разрежённый массив ломает JSON (дырки становятся null) — добиваем нулями.
  for (let k = 0; k <= i; k++) {
    if (typeof progress.stars[k] !== 'number') progress.stars[k] = 0;
    if (typeof progress.best[k] !== 'number') progress.best[k] = 0;
  }

  const improvedStars = stars > prevStars;
  const isRecord = score > prevBest;
  if (improvedStars) progress.stars[i] = stars;
  if (isRecord) progress.best[i] = score;

  saveProgress(slug, progress);
  return { progress, improvedStars, isRecord, unlockedNext: prevStars === 0 };
}

/** Открыт ли уровень: первый открыт всегда, дальше — если пройден предыдущий. */
export function isUnlocked(progress: Progress, n: number): boolean {
  if (n <= 1) return true;
  return (progress.stars[n - 2] ?? 0) > 0;
}

/** Сколько уровней доступно игроку: все пройденные подряд плюс один следующий. */
export function unlockedCount(progress: Progress, total: number): number {
  let n = 1;
  while (n < total && (progress.stars[n - 1] ?? 0) > 0) n++;
  return n;
}

/** Номер уровня, который игра предлагает по умолчанию — первый непройденный. */
export function nextLevel(progress: Progress, total: number): number {
  for (let n = 1; n <= total; n++) if ((progress.stars[n - 1] ?? 0) === 0) return n;
  return total;
}

export function totalStars(progress: Progress): number {
  return progress.stars.reduce((sum, s) => sum + s, 0);
}

export function clearedCount(progress: Progress): number {
  return progress.stars.filter((s) => s > 0).length;
}

/** Вся лестница пройдена — можно открывать бесконечный режим. */
export function isLadderComplete(progress: Progress, total: number): boolean {
  return clearedCount(progress) >= total;
}
