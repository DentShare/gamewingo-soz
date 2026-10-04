import type { StarGoals } from '@gamewingo/game-progress';
import { topRun, type LiquidColor, type PuzzleDefinition } from './colorSort';
import { MIXED_LEVELS } from './mixedLevels';

export interface ColorSortLevel extends PuzzleDefinition {
  readonly n: number; readonly colors: number; readonly goals: StarGoals;
  /** Проверяемый путь решения; par — достижимая граница, не обещание оптимума. */
  readonly solution: readonly (readonly [number, number])[];
  readonly intro?: string;
  readonly goldHint?: string;
}
const PALETTE: readonly LiquidColor[] = ['orange', 'teal', 'gold', 'coral', 'violet', 'green'];
const CAPACITY = 4;
const keyOf = (tubes: readonly (readonly LiquidColor[])[]) => tubes.map((tube) => tube.join(',')).sort().join('|');

/** Ранние уровни — обратные переливания из решённого поля; с пятого —
 * глубокие перемешивания, для которых отдельно найдено и проверено решение. */
export function generateLevel(n: number): ColorSortLevel {
  const mixed = MIXED_LEVELS.find((level) => level.n === n);
  if (mixed) {
    const par = mixed.solution.length;
    return { n, colors: mixed.colors, capacity: CAPACITY,
      tubes: mixed.tubes.map((tube) => tube.map((color) => PALETTE[color])),
      solution: mixed.solution, par,
      goals: { gold: par + Math.max(2, Math.ceil(par * 0.15)), silver: par + Math.max(4, Math.ceil(par * 0.45)) } };
  }
  if (n === 2) return {
    n: 2, colors: 2, capacity: CAPACITY, par: 7, goals: { gold: 9, silver: 12 },
    tubes: [['orange', 'orange', 'teal', 'orange'], ['orange', 'teal', 'orange', 'orange'], ['teal', 'orange', 'orange', 'teal'], []],
    solution: [[0, 3], [1, 3], [0, 1], [2, 1], [2, 0], [1, 2], [1, 3]],
  };
  const colors = Math.min(PALETTE.length, 2 + Math.floor((n - 1) / 2));
  let seed = 7919 * n + 104729;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const order = Array.from({ length: n + 1 }, (_, i) => PALETTE[i % colors]);
  if (order[order.length - 1] === order[0]) [order[order.length - 1], order[order.length - 2]] = [order[order.length - 2], order[order.length - 1]];
  let tubes: LiquidColor[][] = order.map((color) => Array<LiquidColor>(CAPACITY).fill(color));
  tubes.push([]);
  const reverse: [number, number][] = [];
  const unsort = (from: number, to: number, count: number) => {
    tubes[to].push(...tubes[from].splice(tubes[from].length - count, count));
    reverse.push([to, from]);
  };
  // Гарантированный старт: цепочка перемешивает все заполненные колбы,
  // после чего снова оставляет одну пустой — даже если случайный поиск застрянет.
  unsort(0, n + 1, 1);
  for (let i = 1; i <= n; i++) unsort(i, i - 1, 1);
  unsort(n, n + 1, CAPACITY - 1);
  const seen = new Set([keyOf(tubes)]);
  let best = tubes.map((tube) => [...tube]);
  let solution = reverse.slice().reverse();
  let bestComplexity = tubes.reduce((sum, tube) => sum + tube.filter((c, i) => i > 0 && c !== tube[i - 1]).length, 0);

  for (let step = 0; step < 24 + n * 6; step++) {
    const candidates: { tubes: LiquidColor[][]; from: number; to: number; score: number }[] = [];
    for (let from = 0; from < tubes.length; from++) {
      const source = tubes[from];
      if (source.length === 0) continue;
      const color = source[source.length - 1], run = topRun(source);
      for (let to = 0; to < tubes.length; to++) {
        const target = tubes[to];
        if (from === to || target[target.length - 1] === color) continue;
        for (let count = 1; count <= Math.min(run, CAPACITY - target.length); count++) {
          // На обратном ходу остаток исходной колбы должен принять этот цвет.
          if (count === run && count < source.length) continue;
          const next = tubes.map((tube) => [...tube]);
          next[to].push(...next[from].splice(source.length - count, count));
          if (seen.has(keyOf(next))) continue;
          const complexity = next.reduce((sum, tube) => sum + tube.filter((c, i) => i > 0 && c !== tube[i - 1]).length, 0);
          candidates.push({ tubes: next, from, to, score: complexity + random() * 3 });
        }
      }
    }
    if (candidates.length === 0) break;
    candidates.sort((a, b) => b.score - a.score);
    const chosen = candidates[0];
    tubes = chosen.tubes;
    reverse.push([chosen.to, chosen.from]);
    seen.add(keyOf(tubes));
    const complexity = tubes.reduce((sum, tube) => sum + tube.filter((c, i) => i > 0 && c !== tube[i - 1]).length, 0);
    if (tubes.filter((tube) => tube.length === 0).length === 1 && complexity > bestComplexity) {
      best = tubes.map((tube) => [...tube]);
      solution = reverse.slice().reverse();
      bestComplexity = complexity;
    }
  }
  const par = solution.length;
  return { n, colors, capacity: CAPACITY, tubes: best, solution, par,
    goals: { gold: par + Math.max(2, Math.ceil(par * 0.15)), silver: par + Math.max(4, Math.ceil(par * 0.45)) } };
}

const intro: ColorSortLevel = {
  n: 1, colors: 2, capacity: CAPACITY, par: 5, goals: { gold: 6, silver: 8 },
  tubes: [['orange', 'teal', 'orange', 'orange'], ['teal', 'orange', 'teal', 'teal'], []],
  solution: [[0, 2], [1, 0], [1, 2], [0, 1], [0, 2]],
};
export const LADDER: readonly ColorSortLevel[] = [intro, ...Array.from({ length: 9 }, (_, i) => generateLevel(i + 2))].map((level) => ({
  ...level, intro: level.n === 1 ? 'intro.start' : level.n === 5 ? 'intro.mixed' : level.n % 2 === 1 ? 'intro.colors' : 'intro.tube', goldHint: 'menu.goldHint',
}));
export const CHAPTERS = [
  { n: 1, title: 'chapter.basics', levels: [1, 2, 3, 4, 5] },
  { n: 2, title: 'chapter.mixed', levels: [6, 7, 8, 9, 10] },
] as const;
export const LADDER_SIZE = LADDER.length;
export function levelAt(n:number):ColorSortLevel { return LADDER[Math.max(0,Math.min(LADDER.length-1,n-1))]; }
