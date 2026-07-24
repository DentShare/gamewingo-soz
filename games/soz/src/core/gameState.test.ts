import { describe, it, expect } from 'vitest';
import { createGame } from './gameState';

const answer = ['к', 'н', 'и', 'г', 'а'];

describe('gameState', () => {
  it('победа при точном совпадении', () => {
    const g = createGame(answer);
    const r = g.submit(['к', 'н', 'и', 'г', 'а']);
    expect(r.statuses).toEqual(['correct', 'correct', 'correct', 'correct', 'correct']);
    expect(g.status).toBe('won');
    expect(g.guessesUsed).toBe(1);
  });
  it('проигрыш после MAX_GUESSES неверных', () => {
    const g = createGame(answer);
    for (let i = 0; i < 6; i++) g.submit(['б', 'о', 'м', 'ж', 'ы']);
    expect(g.status).toBe('lost');
    expect(g.rows.length).toBe(6);
  });
  it('агрегированные статусы клавиш: correct перебивает present', () => {
    const g = createGame(answer);
    g.submit(['к', 'к', 'к', 'к', 'к']); // к correct на позиции 0
    expect(g.letterStatus('к')).toBe('correct');
    expect(g.letterStatus('б')).toBeUndefined(); // не вводили — клавиша не подсвечена
  });
  it('нельзя ходить после конца', () => {
    const g = createGame(answer);
    g.submit(['к', 'н', 'и', 'г', 'а']);
    expect(() => g.submit(['б', 'о', 'м', 'ж', 'ы'])).toThrow();
  });
});
