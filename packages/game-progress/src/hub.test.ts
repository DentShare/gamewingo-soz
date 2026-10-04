import { beforeEach, describe, expect, it } from 'vitest';
import { gameStatus, getLastPlayed } from './hub.js';
import { recordEndlessResult, recordLevelResult } from './index.js';
import { recordBests } from './records.js';

beforeEach(() => localStorage.clear());

describe('последняя игра', () => {
  it('пока ничего не сыграно — пусто', () => {
    expect(getLastPlayed()).toBeNull();
  });

  it('запоминает игру последнего итога — уровень или забег', () => {
    recordLevelResult({ slug: 'pairs', n: 1, stars: 3, score: 10 });
    expect(getLastPlayed()?.slug).toBe('pairs');
    recordEndlessResult('snake', 100);
    expect(getLastPlayed()?.slug).toBe('snake');
  });
});

describe('строка игры в каталоге', () => {
  it('неначатая лестница', () => {
    expect(gameStatus('pairs', 'ladder')).toMatchObject({ started: false, level: 1, stars: 0, maxStars: 45 });
  });

  it('лестница в процессе: следующий уровень и звёзды', () => {
    recordLevelResult({ slug: 'pairs', n: 1, stars: 3, score: 10 });
    recordLevelResult({ slug: 'pairs', n: 2, stars: 2, score: 10 });
    expect(gameStatus('pairs', 'ladder')).toMatchObject({ started: true, level: 3, stars: 5, complete: false });
  });

  it('аркада: рекорд по метрике и закрытые испытания', () => {
    recordBests('snake', { score: 1240, length: 17 });
    expect(gameStatus('snake', 'arcade')).toMatchObject({ started: true, record: 1240, challengesDone: 0, total: 15 });
    expect(gameStatus('snake', 'arcade', 15, 'length').record).toBe(17);
  });
});
