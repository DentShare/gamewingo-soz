import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'app.title', 'menu.play', 'menu.howto', 'menu.catalog', 'menu.record',
  'menu.challenges', 'menu.nextMilestone', 'menu.milestonesDone', 'game.challenge',
  'game.score', 'result.run', 'result.score', 'result.newBest', 'result.closed',
  'result.playAgain', 'result.menu', 'result.leaderboard', 'error.network',
  'onboarding.drop', 'onboarding.cut', 'onboarding.score',
  'onboarding.next', 'onboarding.done', 'onboarding.skip',
];

describe('i18n (stack)', () => {
  it('ru и uz имеют одинаковый набор ключей', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(uz).sort());
  });
  it('все обязательные ключи присутствуют', () => {
    for (const k of REQUIRED) {
      expect(ru).toHaveProperty(k);
      expect(uz).toHaveProperty(k);
    }
  });
  it('переводы непустые', () => {
    for (const [k, v] of Object.entries(uz)) {
      expect(v, k).toBeTruthy();
    }
  });
  it('t() подставляет параметры', () => {
    expect(t('ru', 'result.score', { score: 1234 })).toContain('1234');
    expect(t('uz', 'menu.challenges', { k: 4, n: 15 })).toContain('4');
  });
});
