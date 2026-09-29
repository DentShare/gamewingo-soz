import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'sound.on', 'sound.off',
  'app.title', 'menu.howto', 'menu.back', 'menu.catalog',
  'chapter.1', 'chapter.2', 'chapter.3',
  'level.field.one', 'level.field.few', 'level.field.many', 'level.goldHint',
  'intro.field', 'intro.walk', 'intro.moveLimit', 'intro.moveLimitTighter', 'intro.timer', 'intro.timerTighter',
  'game.dailyLevel',
  'game.level', 'game.moves', 'game.movesLimit', 'game.fail.moves', 'game.fail.time',
  'result.title', 'result.failed', 'result.gapMoves.one', 'result.gapMoves.few', 'result.gapMoves.many',
  'result.almostDetail', 'result.inPlaceOf',
  'onboarding.board', 'onboarding.tile', 'onboarding.move', 'onboarding.goal',
  'onboarding.next', 'onboarding.done', 'onboarding.skip',
];

describe('i18n (fifteen)', () => {
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
    expect(t('ru', 'result.almostDetail', { moves: 9, need: 8, time: '0:42' })).toContain('0:42');
    expect(t('uz', 'result.inPlaceOf', { k: 11, n: 15 })).toContain('11');
  });
});
