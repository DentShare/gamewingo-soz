import { describe, it, expect } from 'vitest';
import { createPairsGame } from './game';
import { buildDeck, LEVELS, SYMBOLS } from './deck';
import { mulberry32 } from './rng';
import { computeScore, stars } from './score';

function deckOf(symbols: string[]) {
  return symbols.map((symbol) => ({ symbol }));
}

describe('deck', () => {
  it('строит колоду: pairs×2 карт, каждая ровно дважды, детерминированно по seed', () => {
    const d1 = buildDeck(6, mulberry32(42));
    const d2 = buildDeck(6, mulberry32(42));
    expect(d1.length).toBe(12);
    expect(d1.map((c) => c.symbol)).toEqual(d2.map((c) => c.symbol));
    const counts = new Map<string, number>();
    for (const c of d1) counts.set(c.symbol, (counts.get(c.symbol) ?? 0) + 1);
    expect([...counts.values()].every((n) => n === 2)).toBe(true);
  });

  it('уровни укладываются в набор символов', () => {
    for (const spec of Object.values(LEVELS)) {
      expect(spec.cols * spec.rows).toBe(spec.pairs * 2);
      expect(spec.pairs).toBeLessThanOrEqual(SYMBOLS.length);
    }
  });
});

describe('createPairsGame', () => {
  it('находит пару: first → match, ходы и счёт пар растут', () => {
    const g = createPairsGame(deckOf(['a', 'b', 'a', 'b']));
    expect(g.flip(0)).toBe('first');
    expect(g.flip(2)).toBe('match');
    expect(g.moves).toBe(1);
    expect(g.pairsFound).toBe(1);
    expect(g.isMatched(0)).toBe(true);
  });

  it('промах: miss, карты закрываются только после closeMiss', () => {
    const g = createPairsGame(deckOf(['a', 'b', 'a', 'b']));
    g.flip(0);
    expect(g.flip(1)).toBe('miss');
    expect(g.flip(2)).toBe('ignored'); // до closeMiss ввод игнорируется
    g.closeMiss();
    expect(g.open.length).toBe(0);
    expect(g.flip(2)).toBe('first');
  });

  it('повторный клик по открытой и по найденной карте игнорируется', () => {
    const g = createPairsGame(deckOf(['a', 'b', 'a', 'b']));
    g.flip(0);
    expect(g.flip(0)).toBe('ignored');
    g.flip(2); // match
    expect(g.flip(0)).toBe('ignored');
  });

  it('последняя пара даёт won', () => {
    const g = createPairsGame(deckOf(['a', 'b', 'a', 'b']));
    g.flip(0); g.flip(2);
    g.flip(1);
    expect(g.flip(3)).toBe('won');
    expect(g.pairsFound).toBe(2);
  });
});

describe('score', () => {
  it('идеальная партия даёт максимум, точность снижает счёт', () => {
    const perfect = computeScore({ pairs: 6, moves: 6, durationMs: 10_000 });
    const sloppy = computeScore({ pairs: 6, moves: 18, durationMs: 10_000 });
    expect(perfect).toBeGreaterThan(sloppy);
    expect(perfect).toBeLessThanOrEqual(6 * 400 + 600);
  });

  it('время уменьшает бонус, но не уводит в минус', () => {
    const fast = computeScore({ pairs: 6, moves: 8, durationMs: 5_000 });
    const slow = computeScore({ pairs: 6, moves: 8, durationMs: 400_000 });
    expect(fast).toBeGreaterThan(slow);
    expect(slow).toBeGreaterThan(0);
  });

  it('звёзды по точности', () => {
    expect(stars(6, 6)).toBe(3);
    expect(stars(6, 12)).toBe(2);
    expect(stars(6, 20)).toBe(1);
  });
});
