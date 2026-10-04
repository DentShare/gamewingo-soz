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

/**
 * Уровней в главе. Пятнадцать ступеней — три главы по пять: названия глав игра
 * даёт сама (по рычагу сложности), а границы общие — их знает и сервер, когда
 * решает, закрылась ли глава.
 */
export const CHAPTER_SIZE = 5;

/** Номера уровней по главам: [[1..5], [6..10], [11..15]] для лестницы из пятнадцати. */
export function chapterLevels(total: number, size: number = CHAPTER_SIZE): number[][] {
  const out: number[][] = [];
  for (let start = 1; start <= total; start += size) {
    out.push(Array.from({ length: Math.min(size, total - start + 1) }, (_, i) => start + i));
  }
  return out;
}

/**
 * Какие рычаги сложности изменились между соседними уровнями. Для тестов
 * лестниц: правило «один новый рычаг за раз» (docs/PROGRESSION.md) проверяется
 * как `changedLevers(prev, cur, LEVERS).length <= 1`. Производные параметры
 * (раскладка поля от числа пар) в `keys` не передаются.
 */
export function changedLevers<P>(prev: P, cur: P, keys: readonly (keyof P)[]): (keyof P)[] {
  return keys.filter((k) => prev[k] !== cur[k]);
}

/**
 * Как рычаг делает уровень сложнее:
 * - `more` — чем больше, тем сложнее (пары, клетки, варианты ответа);
 * - `less` — чем меньше, тем сложнее (подсказки, попытки);
 * - `limit` — ограничение, где 0 значит «без ограничения»: появиться или
 *   ужаться — сложнее (лимит ходов, таймер, лимит ошибок).
 */
export type LeverDirection = 'more' | 'less' | 'limit';

/**
 * Рычаги, которые стали жёстче между соседними уровнями. Правило лестницы:
 * ровно один на уровень. Остальные могут смягчаться — так новый размер поля
 * начинается с мягкого лимита, а не со стены (docs/PROGRESSION.md).
 */
export function harderLevers<P>(prev: P, cur: P, spec: { [K in keyof P]?: LeverDirection }): (keyof P)[] {
  return (Object.keys(spec) as (keyof P)[]).filter((k) => {
    const a = Number(prev[k]);
    const b = Number(cur[k]);
    switch (spec[k]) {
      case 'more': return b > a;
      case 'less': return b < a;
      case 'limit': return b > 0 && (a === 0 || b < a);
      default: return false;
    }
  });
}

export interface StarGap {
  /** Порог трёх звёзд — «нужно 8». */
  threshold: number;
  /** Сколько не хватило до третьей звезды — «до третьей звезды — 1 ход». */
  missing: number;
}

/**
 * «Почти»: сколько не хватило до трёх звёзд (T4, карточка на экране итога).
 * `null` — три звезды уже есть, объяснять нечего. Что это за величина (ходы,
 * секунды, ошибки) — знает игра: она и подписывает дельту своим словом.
 */
export function starGap(goals: StarGoals, value: number): StarGap | null {
  if (!Number.isFinite(value) || !Number.isFinite(goals.gold)) return null;
  if (starsFor(goals, value) === 3) return null;
  const missing = goals.higherIsBetter ? goals.gold - value : value - goals.gold;
  return { threshold: goals.gold, missing: Math.max(1, Math.ceil(missing)) };
}
