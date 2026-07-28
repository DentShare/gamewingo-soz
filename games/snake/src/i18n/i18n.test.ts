import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'app.title', 'menu.play', 'menu.howto', 'menu.catalog', 'menu.best', 'menu.back',
  'game.swipeToStart', 'game.length',
  'onboarding.move', 'onboarding.food', 'onboarding.crash',
  'onboarding.next', 'onboarding.done', 'onboarding.skip',
  'result.title', 'result.score', 'result.length', 'result.newBest',
  'result.playAgain', 'result.menu', 'result.leaderboard', 'error.network',
];

describe('i18n (snake)', () => {
  it('ru и uz имеют одинаковый набор ключей', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(uz).sort());
  });

  it('все обязательные ключи присутствуют', () => {
    for (const k of REQUIRED) {
      expect(ru).toHaveProperty(k);
      expect(uz).toHaveProperty(k);
    }
  });

  it('ни одна строка не пустая', () => {
    for (const dict of [ru, uz]) {
      for (const [k, v] of Object.entries(dict)) {
        expect(typeof v, k).toBe('string');
        expect(v.trim().length, k).toBeGreaterThan(0);
      }
    }
  });

  it('плейсхолдеры {…} совпадают в обоих языках', () => {
    const holders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const k of Object.keys(ru) as Array<keyof typeof ru>) {
      expect(holders(uz[k]), k).toEqual(holders(ru[k]));
    }
  });

  it('t() подставляет параметры', () => {
    expect(t('ru', 'result.score', { score: 1500 })).toContain('1500');
    expect(t('uz', 'result.length', { n: 12 })).toContain('12');
  });
});
