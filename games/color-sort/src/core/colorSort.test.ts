import { describe, expect, it } from 'vitest';
import { canMove, createColorSortState, isSolved, move, topRun, type PuzzleDefinition } from './colorSort';
const puzzle: PuzzleDefinition = { capacity:4, par:4, tubes:[['orange','teal','orange','orange'],['teal','orange','teal','teal'],[]] };
describe('color sort core', () => {
  it('counts a contiguous top run', () => { expect(topRun(['teal','orange','orange'])).toBe(2); expect(topRun([])).toBe(0); });
  it('allows only empty or same-color targets', () => { const s=createColorSortState(puzzle); expect(canMove(s,0,2)).toBe(true); expect(canMove(s,0,1)).toBe(false); });
  it('moves the whole top group without mutating source state', () => { const s=createColorSortState(puzzle); const r=move(s,0,2); expect(r.moved).toEqual(['orange','orange']); expect(r.state.tubes[0].colors).toEqual(['orange','teal']); expect(s.tubes[0].colors).toHaveLength(4); });
  it('keeps invalid moves unchanged', () => { const s=createColorSortState(puzzle); expect(move(s,0,1).state).toBe(s); });
  it('recognizes solved tubes', () => { expect(isSolved([{colors:['orange','orange','orange','orange']},{colors:['teal','teal','teal','teal']},{colors:[]}],4)).toBe(true); });
});
