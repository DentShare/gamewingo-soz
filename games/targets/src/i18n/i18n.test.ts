import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'app.title', 'menu.play', 'menu.howto', 'menu.catalog', 'menu.best',
  'game.combo', 'game.time',
  'result.title', 'result.score', 'result.hits', 'result.newBest',
  'result.playAgain', 'result.menu', 'result.leaderboard',
  'error.network',
  'onboarding.aim', 'onboarding.combo', 'onboarding.time',
  'onboarding.next', 'onboarding.done', 'onboarding.skip',
];

describe('i18n (targets)', () => {
  it('ru и uz имеют одинаковый набор ключей', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(uz).sort());
  });

  it('все обязательные ключи присутствуют', () => {
    for (const k of REQUIRED) {
      expect(ru).toHaveProperty(k);
      expect(uz).toHaveProperty(k);
    }
  });

  it('нет пустых переводов', () => {
    for (const dict of [ru, uz]) {
      for (const [k, v] of Object.entries(dict)) {
        expect(typeof v, k).toBe('string');
        expect((v as string).trim().length, k).toBeGreaterThan(0);
      }
    }
  });

  it('плейсхолдеры совпадают в обеих локалях', () => {
    const holders = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();
    for (const k of Object.keys(ru)) {
      expect(holders((uz as Record<string, string>)[k]), k)
        .toEqual(holders((ru as Record<string, string>)[k]));
    }
  });

  it('t() подставляет параметры и знает обе локали', () => {
    expect(t('ru', 'result.score', { score: 1234 })).toContain('1234');
    expect(t('uz', 'game.combo', { n: 4 })).toContain('4');
    expect(t('ru', 'result.hits', { hits: 12, combo: 7 })).toBe('Попаданий: 12 · Серия: 7');
  });
});
