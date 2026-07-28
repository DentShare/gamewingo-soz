import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'app.title', 'menu.kids', 'menu.classic', 'menu.howto', 'menu.back', 'menu.catalog',
  'game.moves', 'result.title', 'result.score', 'result.playAgain', 'result.leaderboard',
  'error.network',
  'onboarding.board', 'onboarding.tile', 'onboarding.move', 'onboarding.goal',
  'onboarding.next', 'onboarding.done', 'onboarding.skip',
];

describe('i18n (fifteen)', () => {
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
  });
});
