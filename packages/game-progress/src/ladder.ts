/**
 * Лестница уровней — общая для всех игр каталога форма «кампании».
 *
 * Игра описывает свои уровни списком `LevelDef<P>`: номер, параметры генерации партии
 * и пороги на звёзды. Всё остальное (разблокировка, подсчёт звёзд, сохранение)
 * одинаково во всех играх и живёт здесь.
 */

/**
 * Пороги на звёзды по одной измеримой величине партии: ходы, секунды, ошибки, очки.
 * `gold` — на три звезды, `silver` — на две; хуже `silver` — одна звезда за прохождение.
 *
 * По умолчанию меньше значит лучше (ходы, секунды, ошибки). Для величин, где больше
 * значит лучше (набранные очки), ставится `higherIsBetter`.
 */
export interface StarGoals {
  gold: number;
  silver: number;
  higherIsBetter?: boolean;
}

export type Stars = 1 | 2 | 3;

/** Уровень лестницы: `n` — номер для игрока (1-based), `params` — что подать в ядро игры. */
export interface LevelDef<P> {
  n: number;
  params: P;
  goals: StarGoals;
}

/**
 * Звёзды за пройденный уровень. Уровень считается пройденным всегда, когда сюда попали,
 * поэтому минимум — одна звезда: игрок дошёл до конца, это не «ноль».
 */
export function starsFor(goals: StarGoals, value: number): Stars {
  const better = goals.higherIsBetter
    ? (a: number, b: number) => a >= b
    : (a: number, b: number) => a <= b;
  if (better(value, goals.gold)) return 3;
  if (better(value, goals.silver)) return 2;
  return 1;
}

/**
 * Собирает лестницу из функции параметров и функции порогов — так игре не приходится
 * выписывать двадцать литералов руками, а кривая сложности остаётся в одном месте.
 */
export function buildLadder<P>(
  count: number,
  params: (n: number) => P,
  goals: (n: number, p: P) => StarGoals,
): LevelDef<P>[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const p = params(n);
    return { n, params: p, goals: goals(n, p) };
  });
}

/**
 * Линейная интерполяция параметра по лестнице: на первом уровне `from`, на последнем `to`.
 * Значение округляется — почти все параметры игр целочисленные (пары, клетки, секунды).
 */
export function ramp(n: number, count: number, from: number, to: number): number {
  if (count <= 1) return Math.round(to);
  const t = (n - 1) / (count - 1);
  return Math.round(from + (to - from) * t);
}
