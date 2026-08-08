import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'app.title', 'menu.ladder', 'menu.play', 'menu.howto', 'menu.catalog', 'menu.topics',
  'game.progress', 'game.mistakes', 'game.fact', 'game.next', 'game.finish',
  'topic.space', 'topic.animals', 'topic.uzbekistan', 'topic.science', 'topic.body', 'topic.money',
  'onboarding.question', 'onboarding.fact', 'onboarding.mistakes',
  'onboarding.next', 'onboarding.done', 'onboarding.skip',
  'result.title', 'result.failed', 'result.score', 'result.detail', 'result.level',
  'result.nextLevel', 'result.unlocked', 'result.tryAgain',
  'result.newBest', 'result.playAgain', 'result.menu', 'error.network',
];

describe('i18n (quiz)', () => {
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
    expect(t('ru', 'result.score', { score: 1300 })).toContain('1300');
    expect(t('uz', 'game.mistakes', { n: 2, max: 3 })).toContain('2');
    expect(t('ru', 'game.progress', { n: 3, total: 10 })).toBe('3 из 10');
    expect(t('uz', 'game.progress', { n: 3, total: 10 })).toBe('10 dan 3');
  });
});
