import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'sound.on', 'sound.off',
  'app.title', 'menu.daily', 'menu.practice', 'menu.howto', 'game.invalidWord', 'game.notInList',
  'result.won', 'result.lost', 'result.answerWas', 'result.share', 'result.claim', 'result.streak',
  'result.claimed', 'result.leaderboard', 'result.guesses', 'result.almostDetail',
  'result.gapGuesses.one', 'result.gapGuesses.few', 'result.gapGuesses.many', 'a11y.highContrast',
  'tutorial.firstMove', 'rule.colors', 'rule.colorsContrast',
];

describe('i18n', () => {
  it('ru и uz имеют одинаковый набор ключей', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(uz).sort());
  });
  it('все обязательные ключи присутствуют', () => {
    for (const k of REQUIRED) {
      expect(ru).toHaveProperty(k);
      expect(uz).toHaveProperty(k);
    }
  });
  it('t() достаёт строку и подставляет параметры', () => {
    expect(t('ru', 'result.answerWas', { word: 'книга' })).toContain('книга');
    expect(t('uz', 'result.guesses', { n: 3, max: 6 })).toContain('3');
    expect(t('ru', 'result.almostDetail', { used: 4, need: 3 })).toContain('4');
  });
});
