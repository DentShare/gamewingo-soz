import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadBest, saveBest, loadSave, saveGame, clearSave, hasOnboarded, setOnboarded, loadBoardSize, saveBoardSize,
  type SavedGame,
} from './persistence';
import { createGrid2048 } from './grid';

const SAMPLE: SavedGame = {
  cells: [
    [2, 4, 8, 16],
    [0, 32, 0, 64],
    [128, 0, 256, 0],
    [0, 0, 0, 512],
  ],
  score: 1234,
  moves: 57,
  won: false,
};

beforeEach(() => {
  localStorage.clear();
});

describe('рекорд', () => {
  it('пусто → 0; сохраняется только улучшение', () => {
    expect(loadBest()).toBe(0);
    expect(saveBest(100)).toBe(true);
    expect(loadBest()).toBe(100);
    expect(saveBest(50)).toBe(false);
    expect(loadBest()).toBe(100);
  });
});

describe('сохранение партии', () => {
  it('restores a 5×5 game with its original dimension and continues normally', () => {
    const cells = Array.from({ length: 5 }, () => [0, 0, 0, 0, 0]);
    cells[4][3] = cells[4][4] = 2;
    saveGame({ cells, score: 100, moves: 7, won: false });
    const g = createGrid2048(() => 0, loadSave()!);
    expect(g.size).toBe(5);
    g.move('right');
    expect(g.cells[4][4]).toBe(4);
    expect(g.score).toBe(104);
    expect(g.moves).toBe(8);
  });

  it('rejects ragged and unsupported dimensions', () => {
    for (const cells of [Array.from({ length: 5 }, () => [0, 0, 0, 0]), Array.from({ length: 6 }, () => Array(6).fill(0))]) {
      localStorage.setItem('2048:save', JSON.stringify({ ...SAMPLE, cells }));
      expect(loadSave()).toBeNull();
    }
  });

  it('stores the new-game preference without overwriting a saved 4×4 game', () => {
    expect(loadBoardSize()).toBe(4);
    saveGame(SAMPLE);
    saveBoardSize(5);
    expect(loadBoardSize()).toBe(5);
    expect(loadSave()!.cells).toEqual(SAMPLE.cells);
    localStorage.setItem('2048:boardSize', '6');
    expect(loadBoardSize()).toBe(4);
  });
  it('нет сохранения → null', () => {
    expect(loadSave()).toBeNull();
  });

  it('round-trip: сохранил → восстановил, поля совпадают', () => {
    saveGame(SAMPLE);
    const back = loadSave();
    expect(back).not.toBeNull();
    expect(back!.cells).toEqual(SAMPLE.cells);
    expect(back!.score).toBe(SAMPLE.score);
    expect(back!.moves).toBe(SAMPLE.moves);
    expect(back!.won).toBe(SAMPLE.won);
  });

  it('снимок копируется глубоко — мутации после сохранения не влияют', () => {
    const state: SavedGame = { ...SAMPLE, cells: SAMPLE.cells.map((r) => [...r]) };
    saveGame(state);
    state.cells[0][0] = 999;
    expect(loadSave()!.cells[0][0]).toBe(2);
  });

  it('флаг победы переживает round-trip', () => {
    saveGame({ ...SAMPLE, won: true });
    expect(loadSave()!.won).toBe(true);
  });

  it('clearSave() очищает сохранение', () => {
    saveGame(SAMPLE);
    expect(loadSave()).not.toBeNull();
    clearSave();
    expect(loadSave()).toBeNull();
  });

  it('битые данные не роняют игру → null', () => {
    localStorage.setItem('2048:save', '{не json');
    expect(loadSave()).toBeNull();
    localStorage.setItem('2048:save', JSON.stringify({ cells: [[1, 2]], score: 1, moves: 1, won: false }));
    expect(loadSave()).toBeNull();
    localStorage.setItem('2048:save', JSON.stringify({ cells: SAMPLE.cells, score: 'x', moves: 1, won: false }));
    expect(loadSave()).toBeNull();
  });

  it('ядро восстанавливается из снимка: cells/score/moves/won совпадают', () => {
    saveGame({ ...SAMPLE, won: true });
    const saved = loadSave()!;
    const g = createGrid2048(() => 0.5, saved);
    expect(g.cells).toEqual(SAMPLE.cells);
    expect(g.score).toBe(SAMPLE.score);
    expect(g.moves).toBe(SAMPLE.moves);
    expect(g.hasWon()).toBe(true);
    expect(g.maxTile()).toBe(512);
  });

  it('партия продолжается с восстановленного счёта и числа ходов', () => {
    const g = createGrid2048(() => 0, { cells: [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 100, moves: 9 });
    g.move('left');
    expect(g.score).toBe(104); // 100 + слитая 4
    expect(g.moves).toBe(10);
  });
});

describe('флаг обучения', () => {
  it('по умолчанию false, после setOnboarded() — true', () => {
    expect(hasOnboarded()).toBe(false);
    setOnboarded();
    expect(hasOnboarded()).toBe(true);
  });
});
