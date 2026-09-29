import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'sound.on', 'sound.off',
  'app.title', 'menu.play', 'menu.howto', 'menu.catalog', 'menu.record',
  'menu.challenges',
  'game.tapToStart', 'game.challenge',
  'result.passed.one', 'result.passed.few', 'result.passed.many', 'result.points.one', 'result.points.few', 'result.points.many',
  'onboarding.flap', 'onboarding.gap', 'onboarding.score',
  'onboarding.next', 'onboarding.done', 'onboarding.skip',
];

describe('i18n (flyer)', () => {
  it('ru и uz имеют одинаковый набор ключей', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(uz).sort());
  });

  it('все обязательные ключи присутствуют', () => {
    for (const k of REQUIRED) {
      expect(ru).toHaveProperty(k);
      expect(uz).toHaveProperty(k);
    }
  });

  it('переводы не пустые и не совпадают с русскими дословно', () => {
    for (const k of Object.keys(ru) as (keyof typeof ru)[]) {
      expect(uz[k as keyof typeof uz].length).toBeGreaterThan(0);
    }
    expect(uz['app.title']).not.toBe(ru['app.title']);
    expect(uz['result.passed.many']).not.toBe(ru['result.passed.many']);
  });

  it('t() подставляет параметры', () => {
    expect(t('ru', 'result.points.many', { n: 1234 })).toContain('1234');
    expect(t('uz', 'result.passed.many', { n: 12 })).toContain('12');
    expect(t('uz', 'menu.challenges', { k: 7, n: 15 })).toContain('7');
  });
});
