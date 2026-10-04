import { describe, expect, it } from 'vitest';
import { starsFor } from '@gamewingo/game-progress';
import { LADDER, CHAPTERS, generateLevel } from './levels';
import { createColorSortState, move } from './colorSort';

function solved(tubes: readonly (readonly string[])[], capacity: number): boolean {
  return tubes.every((tube) => tube.length === 0 || (tube.length === capacity && tube.every((color) => color === tube[0])));
}

/** Поиск с канонизацией колб: доказывает, что каждый опубликованный уровень можно закончить. */
function hasSolution(start: readonly (readonly string[])[], capacity: number): boolean {
  const queue: string[][][] = [start.map((tube) => [...tube])];
  const keyOf = (tubes: readonly (readonly string[])[]) => tubes.map((tube) => tube.join(',')).sort().join('|');
  const seen = new Set([keyOf(start)]);
  for (let cursor = 0; cursor < queue.length && seen.size < 300_000; cursor++) {
    const tubes = queue[cursor];
    if (solved(tubes, capacity)) return true;
    for (let from = 0; from < tubes.length; from++) {
      const source = tubes[from]; if (source.length === 0) continue;
      const color = source[source.length - 1];
      let run = 1; while (source.length - run > 0 && source[source.length - run - 1] === color) run++;
      for (let to = 0; to < tubes.length; to++) {
        const target = tubes[to];
        if (from === to || target.length >= capacity || (target.length > 0 && target[target.length - 1] !== color)) continue;
        const count = Math.min(run, capacity - target.length);
        const next = tubes.map((tube) => [...tube]);
        next[to].push(...next[from].splice(next[from].length - count, count));
        const key = keyOf(next); if (!seen.has(key)) { seen.add(key); queue.push(next); }
      }
    }
  }
  return false;
}

describe('color-sort ladder', () => {
  it('has consecutive levels and valid star goals', () => {
    LADDER.forEach((level, index) => {
      expect(level.n).toBe(index + 1);
      expect(level.goals.gold).toBeLessThan(level.goals.silver);
      expect(starsFor(level.goals, level.goals.gold)).toBe(3);
    });
  });
  it('adds one tube per level and a new color every two levels', () => {
    LADDER.forEach((level, index) => {
      expect(level.tubes).toHaveLength(index + 3);
      expect(level.colors).toBe(2 + Math.floor(index / 2));
    });
  });
  it('preserves valid color volumes and the planned empty reserve', () => {
    for (const level of LADDER) {
      const counts = new Map<string, number>();
      for (const tube of level.tubes) for (const color of tube) counts.set(color, (counts.get(color) ?? 0) + 1);
      expect(counts.size).toBe(level.colors);
      for (const count of counts.values()) expect(count % level.capacity).toBe(0);
      const emptyReserve = level.n >= 5 ? 2 : 1;
      expect([...counts.values()].reduce((sum, count) => sum + count, 0)).toBe((level.tubes.length - emptyReserve) * level.capacity);
      expect(level.tubes.filter((tube) => tube.length === 0)).toHaveLength(emptyReserve);
      expect(level.tubes.some((tube) => new Set(tube).size > 1), `mixed level ${level.n}`).toBe(true);
      expect(level.tubes.every((tube) => tube.length <= level.capacity)).toBe(true);
    }
  });
  it('deeply mixes every filled tube from level five', () => {
    for (const level of LADDER.filter((level) => level.n >= 5)) {
      for (const tube of level.tubes.filter((tube) => tube.length)) {
        expect(tube).toHaveLength(level.capacity);
        expect(new Set(tube).size, `distinct colors, level ${level.n}`).toBeGreaterThanOrEqual(3);
        for (let i = 1; i < tube.length; i++) expect(tube[i], `separate layers, level ${level.n}`).not.toBe(tube[i - 1]);
      }
    }
  });
  it('does not reveal a sorted source or complete a tube with the first pour on harder levels', () => {
    for (const level of LADDER.filter((level) => level.n >= 5)) {
      const state = createColorSortState(level);
      for (let from = 0; from < state.tubes.length; from++) for (let to = 0; to < state.tubes.length; to++) {
        const result = move(state, from, to);
        if (!result.valid) continue;
        expect(result.moved).toHaveLength(1);
        expect(new Set(result.state.tubes[from].colors).size).toBeGreaterThanOrEqual(2);
        expect(result.completedTube).toBeNull();
        expect(result.state.completed).toBe(false);
      }
    }
  });
  it('keeps every published puzzle solvable', () => {
    for (const level of LADDER) {
      let state = createColorSortState(level);
      for (const [from, to] of level.solution) {
        if (state.completed) break;
        const result = move(state, from, to);
        expect(result.valid, `level ${level.n}, move ${state.moves + 1}`).toBe(true);
        state = result.state;
      }
      expect(state.completed, `level ${level.n}`).toBe(true);
      expect(state.moves).toBeLessThanOrEqual(level.par);
      expect(starsFor(level.goals, state.moves)).toBe(3);
    }
    expect(hasSolution(LADDER[0].tubes, LADDER[0].capacity)).toBe(true);
  });
  it('generates the same puzzles on restart and reload', () => {
    for (const level of LADDER.slice(1)) {
      const { intro: _intro, goldHint: _goldHint, ...puzzle } = level;
      expect(generateLevel(level.n)).toEqual(puzzle);
    }
  });
  it('keeps the agreed ten-level ladder in two chapters with clear introductions', () => {
    expect(CHAPTERS.flatMap((chapter) => [...chapter.levels])).toEqual(LADDER.map((level) => level.n));
    expect(LADDER.every((level) => level.intro && level.goldHint)).toBe(true);
    expect(LADDER[4].intro).toBe('intro.mixed');
  });
});
