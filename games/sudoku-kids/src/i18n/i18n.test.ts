import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'app.title', 'menu.easy4', 'menu.easy6', 'menu.hard6', 'menu.howto', 'menu.back',
  'menu.best', 'game.hints', 'howto.body', 'result.title', 'result.score', 'result.time',
  'result.newBest', 'result.playAgain', 'result.menu', 'result.leaderboard', 'error.network',
];

describe('i18n (sudoku-kids)', () => {
  it('ru и uz имеют одинаковый набор ключей', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(uz).sort());
  });
  it('все обязательные ключи присутствуют', () => {
    for (const k of REQUIRED) {
      expect(ru).toHaveProperty(k);
      expect(uz).toHaveProperty(k);
    }
  });
  it('t() подставляет параметры', () => {
    expect(t('ru', 'result.score', { score: 1234 })).toContain('1234');
    expect(t('uz', 'game.hints', { n: 2 })).toContain('2');
  });
});
