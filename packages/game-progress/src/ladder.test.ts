import { describe, expect, it } from 'vitest';
import { buildLadder, ramp, starsFor } from './ladder.js';

describe('starsFor', () => {
  it('меньше — лучше: ходы, секунды, ошибки', () => {
    const goals = { gold: 10, silver: 16 };
    expect(starsFor(goals, 8)).toBe(3);
    expect(starsFor(goals, 10)).toBe(3); // порог включительно
    expect(starsFor(goals, 11)).toBe(2);
    expect(starsFor(goals, 16)).toBe(2);
    expect(starsFor(goals, 17)).toBe(1);
  });

  it('больше — лучше: набранные очки', () => {
    const goals = { gold: 900, silver: 500, higherIsBetter: true };
    expect(starsFor(goals, 1200)).toBe(3);
    expect(starsFor(goals, 900)).toBe(3);
    expect(starsFor(goals, 700)).toBe(2);
    expect(starsFor(goals, 400)).toBe(1);
  });

  it('за прохождение всегда минимум одна звезда', () => {
    expect(starsFor({ gold: 1, silver: 2 }, 9999)).toBe(1);
    expect(starsFor({ gold: 1e9, silver: 1e8, higherIsBetter: true }, 0)).toBe(1);
  });
});

describe('ramp', () => {
  it('на первом уровне from, на последнем to', () => {
    expect(ramp(1, 12, 4, 15)).toBe(4);
    expect(ramp(12, 12, 4, 15)).toBe(15);
  });

  it('растёт монотонно', () => {
    const seq = Array.from({ length: 12 }, (_, i) => ramp(i + 1, 12, 4, 15));
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]);
  });

  it('умеет убывать — подсказки судоку уменьшаются', () => {
    expect(ramp(1, 10, 12, 5)).toBe(12);
    expect(ramp(10, 10, 12, 5)).toBe(5);
  });

  it('лестница из одного уровня даёт конечное значение', () => {
    expect(ramp(1, 1, 4, 15)).toBe(15);
  });
});

describe('buildLadder', () => {
  it('нумерует уровни с единицы и зовёт параметры по номеру', () => {
    const ladder = buildLadder(5, (n) => ({ pairs: n + 3 }), (_n, p) => ({ gold: p.pairs, silver: p.pairs * 2 }));
    expect(ladder).toHaveLength(5);
    expect(ladder[0]).toEqual({ n: 1, params: { pairs: 4 }, goals: { gold: 4, silver: 8 } });
    expect(ladder[4].n).toBe(5);
    expect(ladder[4].params.pairs).toBe(8);
  });
});
