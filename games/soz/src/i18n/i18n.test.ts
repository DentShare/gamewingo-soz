import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'sound.on', 'sound.off',
  'app.title', 'menu.daily', 'menu.practice', 'game.invalidWord', 'game.notInList', 'game.fail.time',
  'result.won', 'result.lost', 'result.answerWas', 'result.share', 'result.claim', 'result.claimed',
  'result.almostDetail', 'result.gapGuesses.one', 'result.gapGuesses.few', 'result.gapGuesses.many',
  'result.dailyDate', 'result.solvedOn', 'result.notSolved', 'result.nextWord', 'result.nextWordReady',
  'stats.played', 'stats.winPct', 'stats.streak', 'stats.best', 'stats.distribution', 'date.dayMonth',
  ...Array.from({ length: 12 }, (_, i) => `date.month.${i + 1}`),
  'menu.strict', 'menu.rare', 'menu.timer', 'rule.strict', 'rule.rare', 'rule.timer',
  'settings.title', 'settings.contrastHint', 'settings.done', 'a11y.highContrast',
  'tutorial.firstMove', 'rule.colors', 'rule.colorsContrast',
];

describe('i18n', () => {
  it('ru и uz имеют одинаковый набор ключей', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(uz).sort());
  });
  it('все обязательные ключи присутствуют', () => {
    for (const k of REQUIRED) {
      expect(ru).toHaveProperty(k);
      expect(uz).toHaveProperty(k);
    }
  });
  it('t() достаёт строку и подставляет параметры', () => {
    expect(t('ru', 'result.answerWas', { word: 'книга' })).toContain('книга');
    expect(t('uz', 'result.solvedOn', { n: 3 })).toBe('3-urinishda topildi');
    expect(t('ru', 'result.solvedOn', { n: 4 })).toBe('Отгадано с 4-й попытки');
    expect(t('ru', 'result.claim', { n: 25 })).toBe('Забрать награду +25');
    expect(t('ru', 'date.dayMonth', { d: 28, m: t('ru', 'date.month.9') })).toBe('28 сентября');
    expect(t('uz', 'date.dayMonth', { d: 28, m: t('uz', 'date.month.9') })).toBe('28-sentabr');
    expect(t('ru', 'result.almostDetail', { used: 4, need: 3 })).toContain('4');
  });
});
