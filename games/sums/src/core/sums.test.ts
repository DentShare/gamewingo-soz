import { describe, it, expect } from 'vitest';
import { generate, createSumsGame } from './sums';
import { mulberry32 } from './rng';
import { LADDER, levelAt, perfectCrosses } from './levels';
import { computeScore, baseFor, MAX_SCORE } from './score';

const rnd = (seed: number) => mulberry32(seed);

describe('генератор', () => {
  it('строит задачу от ответа: задуманное решение всегда верное', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const p = generate({ size: 5, keep: 12, maxValue: 9 }, rnd(seed));
      const game = createSumsGame(p);
      // Вычёркиваем ровно то, что не входит в решение.
      p.solution.forEach((keep, i) => { if (!keep) game.toggle(i); });
      expect(game.solved, `seed ${seed}`).toBe(true);
    }
  });

  it('в каждой строке и столбце есть и оставленные, и вычеркнутые клетки', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { size, solution } = generate({ size: 6, keep: 18, maxValue: 12 }, rnd(seed));
      for (let line = 0; line < size; line++) {
        const row = Array.from({ length: size }, (_, i) => solution[line * size + i]);
        const col = Array.from({ length: size }, (_, i) => solution[i * size + line]);
        expect(row.some(Boolean) && row.some((v) => !v), `строка ${line}, seed ${seed}`).toBe(true);
        expect(col.some(Boolean) && col.some((v) => !v), `столбец ${line}, seed ${seed}`).toBe(true);
      }
    }
  });

  it('нулей в клетках не бывает — вычёркивать ноль бессмысленно', () => {
    const p = generate({ size: 7, keep: 24, maxValue: 15, negative: true }, rnd(7));
    expect(p.cells.every((v) => v !== 0)).toBe(true);
  });

  it('отрицательные появляются только там, где разрешены', () => {
    const plain = generate({ size: 6, keep: 18, maxValue: 12 }, rnd(3));
    expect(plain.cells.every((v) => v > 0)).toBe(true);

    const mixed = generate({ size: 8, keep: 34, maxValue: 15, negative: true }, rnd(3));
    expect(mixed.cells.some((v) => v < 0)).toBe(true);
  });

  it('целевые суммы совпадают с суммами задуманного решения', () => {
    const { size, cells, solution, rowTargets, colTargets } = generate(
      { size: 4, keep: 9, maxValue: 9 }, rnd(11),
    );
    for (let r = 0; r < size; r++) {
      const sum = Array.from({ length: size }, (_, c) => (solution[r * size + c] ? cells[r * size + c] : 0))
        .reduce((a, b) => a + b, 0);
      expect(rowTargets[r]).toBe(sum);
    }
    for (let c = 0; c < size; c++) {
      const sum = Array.from({ length: size }, (_, r) => (solution[r * size + c] ? cells[r * size + c] : 0))
        .reduce((a, b) => a + b, 0);
      expect(colTargets[c]).toBe(sum);
    }
  });
});

describe('партия', () => {
  const puzzle = generate({ size: 4, keep: 9, maxValue: 9 }, rnd(21));

  it('вычёркивание переключается и считает ходы', () => {
    const game = createSumsGame(puzzle);
    expect(game.toggle(0)).toBe('crossed');
    expect(game.toggle(0)).toBe('restored');
    expect(game.moves).toBe(2);
    expect(game.undos).toBe(1);
  });

  it('линия отмечается сошедшейся, когда сумма совпала с целью', () => {
    const game = createSumsGame(puzzle);
    puzzle.solution.forEach((keep, i) => { if (!keep) game.toggle(i); });
    for (let i = 0; i < puzzle.size; i++) {
      expect(game.rowDone(i)).toBe(true);
      expect(game.colDone(i)).toBe(true);
    }
  });

  it('победа определяется суммами, а не совпадением с задумкой', () => {
    // Клетки со значением 0 не генерируются, поэтому любой другой набор с теми же
    // суммами — тоже победа. Проверяем это на симметричной задаче вручную.
    const hand = {
      size: 2,
      cells: [3, 3, 3, 3],
      solution: [true, false, false, true],
      rowTargets: [3, 3],
      colTargets: [3, 3],
      minCrosses: 2,
    };
    const game = createSumsGame(hand);
    // Вычёркиваем «другую» диагональ — суммы сходятся так же.
    game.toggle(1);
    game.toggle(2);
    expect(game.solved).toBe(true);
  });

  it('пустое поле решённым не считается', () => {
    expect(createSumsGame(puzzle).solved).toBe(false);
  });
});

describe('лестница', () => {
  it('пятнадцать уровней, размер поля не убывает', () => {
    expect(LADDER).toHaveLength(15);
    for (let i = 1; i < LADDER.length; i++) {
      expect(LADDER[i].params.size).toBeGreaterThanOrEqual(LADDER[i - 1].params.size);
    }
  });

  it('звёзды считаются по лишним касаниям: золото — ноль лишних', () => {
    for (const level of LADDER) {
      expect(level.goals.gold).toBe(0);
      expect(level.goals.silver).toBeGreaterThan(0);
      expect(level.goals.silver).toBeLessThan(perfectCrosses(level.n));
      expect(level.goals.higherIsBetter).toBeUndefined();
    }
  });

  it('оставленных клеток всегда меньше, чем всего, и хватает на все линии', () => {
    for (const { params } of LADDER) {
      expect(params.keep).toBeGreaterThanOrEqual(params.size);
      expect(params.keep).toBeLessThan(params.size * params.size);
    }
  });

  it('номер вне лестницы зажимается', () => {
    expect(levelAt(0).n).toBe(1);
    expect(levelAt(99).n).toBe(15);
  });
});

describe('очки', () => {
  it('идеальная игра даёт базу уровня', () => {
    expect(computeScore({ level: 5, moves: perfectCrosses(5) })).toBe(baseFor(5));
  });

  it('штрафуют только лишние касания', () => {
    const perfect = computeScore({ level: 8, moves: perfectCrosses(8) });
    const sloppy = computeScore({ level: 8, moves: perfectCrosses(8) + 6 });
    expect(sloppy).toBe(perfect - 6 * 40);
    expect(sloppy).toBeGreaterThanOrEqual(100);
  });

  it('перебор наугад не уводит очки ниже сотни', () => {
    expect(computeScore({ level: 1, moves: 500 })).toBe(100);
  });

  it('очки не выходят за MAX_SCORE — на него смотрит антифрод', () => {
    for (const level of LADDER) {
      expect(computeScore({ level: level.n, moves: 0 })).toBeLessThanOrEqual(MAX_SCORE);
    }
  });
});
