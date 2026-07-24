import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'app.title', 'menu.daily', 'menu.practice', 'menu.howto', 'game.invalidWord', 'game.notInList',
  'result.won', 'result.lost', 'result.answerWas', 'result.share', 'result.claim', 'result.streak',
  'result.leaderboard', 'error.network', 'a11y.highContrast',
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
  });
});
