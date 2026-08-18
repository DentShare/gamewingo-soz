import { levelAt, LADDER_SIZE, perfectCrosses } from './levels';

export interface ScoreInput { level: number; moves: number; }

/**
 * База очков за уровень — она же максимум для серверного антифрода.
 * Растёт от размера поля и места в лестнице: девятка с отрицательными
 * числами не может стоить столько же, сколько тройка из однозначных.
 */
export function baseFor(level: number): number {
  const { size } = levelAt(level).params;
  return Math.round(size * size * 60 * (1 + (0.5 * (level - 1)) / (LADDER_SIZE - 1)));
}

/** Максимум по всей лестнице — верхняя граница для серверной проверки. */
export const MAX_SCORE = baseFor(LADDER_SIZE);

/**
 * Очки: база уровня минус 40 за каждое лишнее касание, но не меньше 100.
 *
 * Время в счёт не идёт намеренно. Это головоломка на подумать: секундомер в очках
 * превращает раздумье в спешку, а перебор наугад и без него наказан — каждый лишний
 * тап виден в счётчике ходов. Длительность партии всё равно уходит на сервер,
 * но только как антифрод-сигнал, а не как оценка игрока.
 */
export function computeScore({ level, moves }: ScoreInput): number {
  const base = baseFor(level);
  const extra = Math.max(0, moves - perfectCrosses(level));
  return Math.max(100, base - extra * 40);
}
