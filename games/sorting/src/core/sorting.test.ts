import { describe, it, expect } from 'vitest';
import {
  createSortingGame, COLORS, SHAPES, TOTAL, type Item, type SortingGame,
} from './sorting';
import { mulberry32 } from './rng';
import { computeScore, stars, MAX_SCORE } from './score';

/** Индекс корзины, в которую фигурка кладётся верно в текущем режиме. */
function rightBin(g: SortingGame, item: Item): number {
  return g.bins.indexOf(g.featureOf(item));
}

/** Первая корзина, которая точно НЕ подходит. */
function wrongBin(g: SortingGame, item: Item): number {
  return g.bins.findIndex((b) => b !== g.featureOf(item));
}

/** Разложить всю партию верно; вернуть игру. */
function playPerfect(g: SortingGame): SortingGame {
  while (!g.isDone) {
    const item = g.current!;
    g.drop(rightBin(g, item));
  }
  return g;
}

describe('createSortingGame — режим «по цвету»', () => {
  it('корзины — три цвета, старт с фигуркой в руке', () => {
    const g = createSortingGame('color', mulberry32(1));
    expect(g.bins).toEqual(COLORS);
    expect(g.current).not.toBeNull();
    expect(g.total).toBe(TOTAL);
    expect(g.placed).toBe(0);
    expect(g.mistakes).toBe(0);
    expect(g.isDone).toBe(false);
  });

  it('засчитывает по цвету независимо от формы фигурки', () => {
    const g = createSortingGame('color', mulberry32(7));
    for (let n = 0; n < 12; n++) {
      const item = g.current!;
      // Признак — именно цвет: форма может быть любой.
      expect(g.featureOf(item)).toBe(item.color);
      const res = g.drop(COLORS.indexOf(item.color));
      expect(res.correct).toBe(true);
    }
    expect(g.placed).toBe(TOTAL);
  });
});

describe('createSortingGame — режим «по форме»', () => {
  it('корзины — три формы, засчитывает по форме независимо от цвета', () => {
    const g = createSortingGame('shape', mulberry32(11));
    expect(g.bins).toEqual(SHAPES);
    for (let n = 0; n < 12; n++) {
      const item = g.current!;
      expect(g.featureOf(item)).toBe(item.shape);
      expect(g.drop(SHAPES.indexOf(item.shape)).correct).toBe(true);
    }
    expect(g.placed).toBe(TOTAL);
  });
});

describe('ошибка — не наказание', () => {
  it('неверная корзина: correct=false, mistakes+1, placed не растёт, фигурка та же', () => {
    const g = createSortingGame('color', mulberry32(3));
    const item = g.current!;
    const res = g.drop(wrongBin(g, item));
    expect(res).toEqual({ correct: false, done: false });
    expect(g.mistakes).toBe(1);
    expect(g.placed).toBe(0);
    expect(g.current).toBe(item); // ребёнок пробует ещё раз той же фигуркой
  });

  it('можно ошибаться сколько угодно и всё равно доиграть', () => {
    const g = createSortingGame('shape', mulberry32(5));
    for (let i = 0; i < 10; i++) g.drop(wrongBin(g, g.current!));
    expect(g.mistakes).toBe(10);
    expect(g.isDone).toBe(false);
    playPerfect(g);
    expect(g.placed).toBe(TOTAL);
    expect(g.isDone).toBe(true);
  });

  it('бросок в несуществующую корзину ничего не меняет', () => {
    const g = createSortingGame('color', mulberry32(9));
    const item = g.current!;
    expect(g.drop(-1)).toEqual({ correct: false, done: false });
    expect(g.drop(3)).toEqual({ correct: false, done: false });
    expect(g.mistakes).toBe(0);
    expect(g.current).toBe(item);
  });
});

describe('завершение партии', () => {
  it('после 12 верных → isDone и done=true', () => {
    const g = createSortingGame('color', mulberry32(21));
    let last = { correct: false, done: false };
    while (!g.isDone) last = g.drop(rightBin(g, g.current!));
    expect(last).toEqual({ correct: true, done: true });
    expect(g.isDone).toBe(true);
    expect(g.placed).toBe(TOTAL);
    expect(g.current).toBeNull();
  });

  it('после завершения drop больше ничего не меняет', () => {
    const g = playPerfect(createSortingGame('shape', mulberry32(33)));
    const before = { placed: g.placed, mistakes: g.mistakes };
    expect(g.drop(0)).toEqual({ correct: false, done: true });
    expect(g.drop(1)).toEqual({ correct: false, done: true });
    expect(g.placed).toBe(before.placed);
    expect(g.mistakes).toBe(before.mistakes);
    expect(g.current).toBeNull();
  });
});

describe('генерация фигурок', () => {
  it('каждая выданная фигурка подходит ровно одной корзине (200 итераций)', () => {
    for (const mode of ['color', 'shape'] as const) {
      const rng = mulberry32(1234);
      let seen = 0;
      // Партия — 12 фигурок, поэтому крутим партии подряд на одном RNG.
      while (seen < 200) {
        const g = createSortingGame(mode, rng);
        while (!g.isDone && seen < 200) {
          const item = g.current!;
          expect(g.bins.filter((b) => b === g.featureOf(item)).length).toBe(1);
          expect(COLORS).toContain(item.color);
          expect(SHAPES).toContain(item.shape);
          g.drop(rightBin(g, item));
          seen++;
        }
      }
      expect(seen).toBe(200);
    }
  });

  it('детерминированность по seed', () => {
    const seq = (seed: number) => {
      const g = createSortingGame('color', mulberry32(seed));
      const out: Item[] = [];
      while (!g.isDone) {
        out.push(g.current!);
        g.drop(rightBin(g, g.current!));
      }
      return out;
    };
    expect(seq(2024)).toEqual(seq(2024));
    expect(seq(2024)).not.toEqual(seq(2025));
  });
});

describe('score', () => {
  it('чистая партия даёт максимум', () => {
    expect(computeScore({ placed: 12, mistakes: 0 })).toBe(MAX_SCORE);
    expect(MAX_SCORE).toBe(1500);
  });

  it('ошибки уменьшают только бонус, счёт не уходит в минус', () => {
    expect(computeScore({ placed: 12, mistakes: 2 })).toBe(1300);
    expect(computeScore({ placed: 12, mistakes: 9 })).toBe(1200);
    expect(computeScore({ placed: 0, mistakes: 30 })).toBe(0);
  });

  it('звёзды: 3 без ошибок, 2 до трёх, иначе 1', () => {
    expect(stars(0)).toBe(3);
    expect(stars(3)).toBe(2);
    expect(stars(4)).toBe(1);
  });
});
