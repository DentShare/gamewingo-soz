import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'sound.on', 'sound.off',
  'app.title', 'menu.howto', 'menu.catalog',
  'chapter.1', 'chapter.2', 'chapter.3',
  'level.field.one', 'level.field.few', 'level.field.many', 'level.goldHint', 'level.goldHintClean',
  'intro.field', 'intro.options', 'intro.questions',
  'game.dailyLevel',
  'game.question', 'game.progress',
  'onboarding.count', 'onboarding.tap', 'onboarding.help',
  'onboarding.next', 'onboarding.done', 'onboarding.skip',
  'result.title', 'result.gapMistakes.one', 'result.gapMistakes.few', 'result.gapMistakes.many',
  'result.almostDetail', 'result.almostDetailClean',
];

describe('i18n (counting)', () => {
  it('ru и uz имеют одинаковый набор ключей', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(uz).sort());
  });

  it('все обязательные ключи присутствуют', () => {
    for (const k of REQUIRED) {
      expect(ru).toHaveProperty(k);
      expect(uz).toHaveProperty(k);
    }
  });

  it('ни одно значение не пустое', () => {
    for (const dict of [ru, uz] as Record<string, string>[]) {
      for (const [k, v] of Object.entries(dict)) {
        expect(v.trim().length, k).toBeGreaterThan(0);
      }
    }
  });

  it('t() подставляет параметры в обеих локалях', () => {
    expect(t('ru', 'result.almostDetail', { n: 3, need: 1 })).toBe('Ошибок: 3 · нужно не больше 1');
    expect(t('uz', 'result.gapMistakes.few', { n: 2 })).toContain('2');
    expect(t('ru', 'game.progress', { n: 3, total: 10 })).toBe('3 из 10');
    expect(t('uz', 'game.progress', { n: 3, total: 10 })).toBe('10 dan 3');
  });
});
