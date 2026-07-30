import { levelAt, LADDER_SIZE } from './levels';

/**
 * База уровня — она же максимум score (для серверного антифрод-лимита).
 * Растёт вместе с лестницей: за поздний уровень платят больше, чем за первый.
 */
export function baseFor(level: number): number {
  const { size } = levelAt(level).params;
  const sizeBase = size === 3 ? 2000 : size === 4 ? 4000 : 6000;
  // Плюс до 50 % за место в лестнице — поздний расклад того же размера ценнее раннего.
  return Math.round(sizeBase * (1 + (0.5 * (level - 1)) / (LADDER_SIZE - 1)));
}

/** Максимум по всей лестнице — верхняя граница для серверной проверки. */
export const MAX_SCORE = baseFor(LADDER_SIZE);

export interface ScoreInput { level: number; moves: number; durationMs: number; }

/**
 * Очки за собранное поле: `max(100, base − moves*5 − sec*2)`.
 * Вызывается только по факту победы; максимум = baseFor(level).
 */
export function computeScore({ level, moves, durationMs }: ScoreInput): number {
  const base = baseFor(level);
  const sec = Math.floor(durationMs / 1000);
  return Math.max(100, base - moves * 5 - sec * 2);
}
