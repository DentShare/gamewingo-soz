export type LiquidColor = 'orange' | 'teal' | 'gold' | 'coral' | 'violet' | 'green';
export interface Tube { readonly colors: readonly LiquidColor[]; }
export interface ColorSortState { readonly tubes: readonly Tube[]; readonly capacity: number; readonly moves: number; readonly completed: boolean; }
export interface MoveResult { readonly state: ColorSortState; readonly moved: readonly LiquidColor[]; readonly valid: boolean; readonly completedTube: number | null; }
export interface PuzzleDefinition { readonly capacity: number; readonly tubes: readonly (readonly LiquidColor[])[]; readonly par: number; }

function isUniformFull(colors: readonly LiquidColor[], capacity: number): boolean {
  return colors.length === capacity && colors.every((color) => color === colors[0]);
}
export function isSolved(tubes: readonly Tube[], capacity: number): boolean {
  return tubes.every((tube) => tube.colors.length === 0 || isUniformFull(tube.colors, capacity));
}
export function createColorSortState(puzzle: PuzzleDefinition): ColorSortState {
  const tubes = puzzle.tubes.map((colors) => ({ colors: [...colors] }));
  return { tubes, capacity: puzzle.capacity, moves: 0, completed: isSolved(tubes, puzzle.capacity) };
}
export function topRun(colors: readonly LiquidColor[]): number {
  if (colors.length === 0) return 0;
  const top = colors[colors.length - 1];
  let count = 1;
  for (let i = colors.length - 2; i >= 0 && colors[i] === top; i--) count++;
  return count;
}
export function canMove(state: ColorSortState, from: number, to: number): boolean {
  if (state.completed || from === to) return false;
  const source = state.tubes[from], target = state.tubes[to];
  if (!source || !target || source.colors.length === 0 || target.colors.length >= state.capacity) return false;
  const sourceTop = source.colors[source.colors.length - 1], targetTop = target.colors[target.colors.length - 1];
  return target.colors.length === 0 || sourceTop === targetTop;
}
export function move(state: ColorSortState, from: number, to: number): MoveResult {
  if (!canMove(state, from, to)) return { state, moved: [], valid: false, completedTube: null };
  const next = state.tubes.map((tube) => [...tube.colors]);
  const source = next[from], target = next[to];
  const count = Math.min(topRun(source), state.capacity - target.length);
  const moved = source.splice(source.length - count, count);
  target.push(...moved);
  const tubes = next.map((colors) => ({ colors }));
  const result: ColorSortState = { tubes, capacity: state.capacity, moves: state.moves + 1, completed: isSolved(tubes, state.capacity) };
  return { state: result, moved, valid: true, completedTube: isUniformFull(target, state.capacity) ? to : null };
}
