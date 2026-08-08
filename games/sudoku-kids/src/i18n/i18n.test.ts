import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'sound.on', 'sound.off',
  'app.title', 'menu.ladder', 'menu.play', 'menu.howto', 'menu.back',
  'menu.catalog', 'game.hints', 'game.level', 'game.mistakes',
  'game.fail.mistakes', 'game.fail.time',
  'result.failed', 'result.level', 'result.nextLevel', 'result.unlocked', 'result.tryAgain',
  'onboarding.grid', 'onboarding.row', 'onboarding.block', 'onboarding.input', 'onboarding.hint',
  'onboarding.next', 'onboarding.done', 'onboarding.skip',
  'result.title', 'result.score', 'result.time', 'result.hintsUsed',
  'result.newBest', 'result.playAgain', 'result.menu', 'result.leaderboard', 'error.network',
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
    expect(t('ru', 'result.score', { score: 1234 })).toContain('1234');
    expect(t('uz', 'game.hints', { n: 2 })).toContain('2');
  });
});
