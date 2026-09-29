import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'sound.on', 'sound.off',
  'app.title', 'menu.play', 'menu.continue', 'menu.howto',
  'menu.back', 'menu.catalog', 'menu.record',
  'menu.challenges',
  'game.score', 'game.best', 'game.reached', 'game.challenge',
  'onboarding.swipe', 'onboarding.merge', 'onboarding.score', 'onboarding.goal',
  'onboarding.next', 'onboarding.done', 'onboarding.skip',
  'result.game', 'result.tile', 'result.newGame', 'result.thisGameMissing',
  'result.points.one', 'result.points.few', 'result.points.many',
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
    expect(t('ru', 'result.tile', { n: 512 })).toBe('Плитка 512');
    expect(t('ru', 'result.game', { t: '4:12' })).toBe('Партия · 4:12');
    expect(t('ru', 'result.points.few', { n: 3242 })).toBe('3242 очка');
  });
});
