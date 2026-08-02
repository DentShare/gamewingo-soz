import { levelAt, LADDER_SIZE } from './levels';

export interface ScoreInput { level: number; durationMs: number; hints: number; }

/**
 * База очков за уровень — она же максимум (для серверного антифрода).
 * Зависит от размера поля и места в лестнице: чем меньше подсказок-данных
 * и чем дальше уровень, тем дороже прохождение.
 */
export function baseFor(level: number): number {
  const { size } = levelAt(level).params;
  const sizeBase = size === 4 ? 1500 : 3000;
  return Math.round(sizeBase * (1 + (0.6 * (level - 1)) / (LADDER_SIZE - 1)));
}

/** Максимум по всей лестнице — верхняя граница для серверной проверки. */
export const MAX_SCORE = baseFor(LADDER_SIZE);

/**
 * Очки: база уровня − 2 за секунду − 300 за подсказку, но не меньше 100.
 * Максимум = база уровня (секунды и подсказки только штрафуют).
 */
export function computeScore({ level, durationMs, hints }: ScoreInput): number {
  const base = baseFor(level);
  const sec = Math.floor(durationMs / 1000);
  return Math.max(100, Math.min(base, base - sec * 2 - hints * 300));
}
