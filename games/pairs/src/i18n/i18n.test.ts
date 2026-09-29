import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'sound.on', 'sound.off',
  'app.title', 'menu.howto', 'menu.back',
  'chapter.1', 'chapter.2', 'chapter.3',
  'level.field.one', 'level.field.few', 'level.field.many', 'level.goldHint',
  'intro.field', 'intro.moveLimit', 'intro.moveLimitTighter', 'intro.timer', 'intro.timerTighter',
  'game.dailyLevel', 'result.dailyLevel',
  'game.level', 'game.moves', 'game.movesLimit', 'game.fail.moves', 'game.fail.time',
  'result.title', 'result.failed', 'result.level', 'result.nextLevel', 'result.unlocked',
  'result.score', 'result.playAgain', 'result.leaderboard', 'error.network',
];

describe('i18n (pairs)', () => {
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
  });
});
