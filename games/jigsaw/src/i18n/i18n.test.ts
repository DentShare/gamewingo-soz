import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'sound.on', 'sound.off',
  'app.title', 'menu.howto', 'menu.catalog', 'menu.hint',
  'chapter.1', 'chapter.2', 'chapter.3',
  'level.field.one', 'level.field.few', 'level.field.many', 'level.goldHint', 'level.goldHintFlawless',
  'intro.field', 'intro.hintFainter', 'intro.noHint', 'intro.tray',
  'game.dailyLevel', 'game.level',
  'game.progress', 'game.take', 'game.almost',
  'tutorial.firstMove', 'rule.wrong',
  'result.title', 'result.pictureChapter', 'result.nextPictureIntro',
  'result.gapMisses.one', 'result.gapMisses.few', 'result.gapMisses.many',
  'result.almostDetail', 'result.almostDetailFlawless',
];

describe('i18n (jigsaw)', () => {
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
    expect(t('ru', 'result.pictureChapter', { n: 7, k: 2 })).toBe('Картинка 7 · Глава 2');
    expect(t('uz', 'result.almostDetail', { misses: 3, need: 1 })).toContain('3');
    expect(t('ru', 'game.progress', { n: 3, total: 10 })).toBe('3 из 10');
    expect(t('uz', 'game.progress', { n: 3, total: 10 })).toBe('10 dan 3');
  });
});
