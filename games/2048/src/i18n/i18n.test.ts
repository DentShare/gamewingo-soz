import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'app.title', 'menu.play', 'menu.howto', 'menu.back', 'menu.best',
  'game.score', 'game.best', 'game.won', 'howto.body',
  'result.title', 'result.titleWon', 'result.score', 'result.newBest',
  'result.playAgain', 'result.menu', 'result.leaderboard',
  'error.network',
];

describe('i18n (2048)', () => {
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
    expect(t('ru', 'game.score', { n: 1234 })).toContain('1234');
    expect(t('uz', 'game.best', { n: 512 })).toContain('512');
  });
});
