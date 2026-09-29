import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'app.title', 'menu.howto', 'menu.back',
  'chapter.1', 'chapter.2', 'chapter.3',
  'level.field.one', 'level.field.few', 'level.field.many', 'level.goldHint',
  'intro.field', 'intro.crosses', 'intro.maxValue', 'intro.negative',
  'game.dailyLevel',
  'sound.on', 'sound.off',
  'game.level', 'game.moves', 'game.goal', 'game.reset',
  'onboarding.board', 'onboarding.row', 'onboarding.cross', 'onboarding.reset',
  'onboarding.next', 'onboarding.done', 'onboarding.skip',
  'result.title', 'result.gapMoves.one', 'result.gapMoves.few', 'result.gapMoves.many',
  'result.almostDetail',
];

describe('i18n (sums)', () => {
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
    expect(t('ru', 'result.almostDetail', { moves: 12, best: 10 })).toContain('12');
    expect(t('uz', 'game.moves', { n: 7 })).toContain('7');
  });

  it('в узбекском нет апострофа-заменителя: только ʻ', () => {
    // Прямая кавычка ' и ` в узбекской латинице выглядят как опечатка и ломают перенос.
    for (const value of Object.values(uz as Record<string, string>)) {
      expect(value).not.toMatch(/['`´]/);
    }
  });
});
