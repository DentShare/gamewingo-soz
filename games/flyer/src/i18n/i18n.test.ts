import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'app.title', 'menu.play', 'menu.howto', 'menu.catalog', 'menu.best',
  'game.tapToStart',
  'result.title', 'result.score', 'result.newBest', 'result.playAgain', 'result.menu',
  'result.leaderboard',
  'onboarding.flap', 'onboarding.gap', 'onboarding.score',
  'onboarding.next', 'onboarding.done', 'onboarding.skip',
  'error.network',
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
    expect(uz['result.title']).not.toBe(ru['result.title']);
  });

  it('t() подставляет параметры', () => {
    expect(t('ru', 'result.score', { score: 1234 })).toContain('1234');
    expect(t('uz', 'menu.best', { score: 700 })).toContain('700');
  });
});
