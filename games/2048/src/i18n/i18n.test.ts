import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'app.title', 'menu.play', 'menu.continue', 'menu.howto',
  'menu.back', 'menu.catalog', 'menu.record',
  'menu.challenges', 'menu.nextMilestone', 'menu.milestonesDone',
  'game.score', 'game.best', 'game.reached', 'game.challenge',
  'onboarding.swipe', 'onboarding.merge', 'onboarding.score', 'onboarding.goal',
  'onboarding.next', 'onboarding.done', 'onboarding.skip',
  'result.run', 'result.score', 'result.detail', 'result.newBest', 'result.closed',
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
