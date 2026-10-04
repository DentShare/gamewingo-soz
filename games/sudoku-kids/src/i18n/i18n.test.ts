import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'app.title', 'sound.on', 'sound.off',
  'game.hints', 'game.fail.mistakes', 'game.fail.time',
  'pause.mistakes', 'pause.time',
  'tutorial.firstMove', 'rule.mistake', 'rule.mistakeLimit', 'rule.timer',
];

describe('i18n (sudoku-kids)', () => {
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
    expect(t('ru', 'rule.mistakeLimit', { n: 3 })).toContain('3');
    expect(t('uz', 'pause.time', { t: '1:10' })).toBe('vaqt 1:10');
    expect(t('uz', 'game.hints', { n: 2 })).toContain('2');
  });
});
