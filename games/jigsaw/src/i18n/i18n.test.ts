import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'sound.on', 'sound.off',
  'app.title',
  'game.progress', 'game.take', 'game.almost',
  'pause.progress',
  'tutorial.firstMove', 'rule.wrong',
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
    expect(t('ru', 'pause.progress', { progress: '3 из 10' })).toBe('собрано 3 из 10');
    expect(t('uz', 'pause.progress', { progress: '10 dan 3' })).toContain('10 dan 3');
    expect(t('ru', 'game.progress', { n: 3, total: 10 })).toBe('3 из 10');
    expect(t('uz', 'game.progress', { n: 3, total: 10 })).toBe('10 dan 3');
  });
});
