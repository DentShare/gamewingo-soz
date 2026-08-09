import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'sound.on', 'sound.off',
  'app.title', 'menu.ladder', 'menu.play', 'menu.howto', 'menu.catalog',
  'game.progress', 'result.title', 'result.score', 'result.level', 'result.nextLevel',
  'result.unlocked', 'result.newBest',
  'result.playAgain', 'result.menu', 'error.network',
  'onboarding.take', 'onboarding.drop', 'onboarding.goal',
  'onboarding.next', 'onboarding.done', 'onboarding.skip',
];

describe('i18n (sorting)', () => {
  it('ru и uz имеют одинаковый набор ключей', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(uz).sort());
  });

  it('все обязательные ключи присутствуют', () => {
    for (const k of REQUIRED) {
      expect(ru).toHaveProperty(k);
      expect(uz).toHaveProperty(k);
    }
  });

  it('нет пустых строк', () => {
    for (const dict of [ru, uz]) {
      for (const [k, v] of Object.entries(dict)) {
        expect(typeof v, k).toBe('string');
        expect((v as string).trim().length, k).toBeGreaterThan(0);
      }
    }
  });

  it('t() подставляет параметры в обеих локалях', () => {
    expect(t('ru', 'game.progress', { n: 3, total: 12 })).toBe('3 из 12');
    expect(t('uz', 'game.progress', { n: 3, total: 12 })).toBe('12 dan 3');
    expect(t('ru', 'result.mistakes', { n: 2 })).toContain('2');
  });
});
