import { describe, expect, it } from 'vitest';
import { chapterLevels, harderLevers } from '@gamewingo/game-progress';
import { CHAPTER_TITLES, LADDER, LADDER_SIZE, LEVERS, levelAt, levelInfo } from './levels';

describe('главы лестницы викторины', () => {
  it('на каждом уровне жёстче становится ровно один рычаг', () => {
    for (let i = 1; i < LADDER.length; i++) {
      const harder = harderLevers(LADDER[i - 1].params, LADDER[i].params, LEVERS);
      expect(harder, `уровень ${i + 1}`).toHaveLength(1);
    }
  });

  it('новое ограничение появляется на знакомой партии, а не вместе с её ростом', () => {
    for (let i = 1; i < LADDER.length; i++) {
      const [a, b] = [LADDER[i - 1].params, LADDER[i].params];
      const firstTimer = !a.timeLimitSec && b.timeLimitSec > 0;
      // Лимит ошибок есть всегда; «появляется» он, когда впервые становится строже стартового.
      const firstMistakes = b.maxMistakes < a.maxMistakes && a.maxMistakes === LADDER[0].params.maxMistakes;
      if (firstTimer || firstMistakes) {
        expect(b.questions, `уровень ${i + 1}`).toBe(a.questions);
        expect(b.options, `уровень ${i + 1}`).toBe(a.options);
      }
    }
  });

  it('главы соответствуют названиям: знакомство → точность → на время', () => {
    const [c1, c2, c3] = chapterLevels(LADDER_SIZE).map((ns) => ns.map((n) => levelAt(n).params));
    const gentle = LADDER[0].params.maxMistakes;
    expect(CHAPTER_TITLES).toHaveLength(3);
    expect(c1.every((p) => !p.timeLimitSec && p.maxMistakes === gentle)).toBe(true);
    expect(c2.every((p) => !p.timeLimitSec && p.maxMistakes < gentle)).toBe(true);
    expect(c3.every((p) => p.timeLimitSec > 0)).toBe(true);
  });

  it('финал не легче прежнего: 10 вопросов, 4 варианта, 12 секунд, одна ошибка', () => {
    const last = LADDER[LADDER_SIZE - 1].params;
    expect(last).toMatchObject({ questions: 10, options: 4, timeLimitSec: 12, maxMistakes: 1 });
  });

  it('карточка уровня называет ровно то, что изменилось', () => {
    expect(levelInfo(1).intro).toBeNull();
    expect(levelInfo(2).intro).toEqual({ key: 'intro.questions', vars: { n: 6 } });
    expect(levelInfo(3).intro).toEqual({ key: 'intro.options', vars: { n: 4 } });
    expect(levelInfo(6).intro).toEqual({ key: 'intro.mistakes', vars: { n: 3 } });
    expect(levelInfo(11).intro).toEqual({ key: 'intro.timer', vars: { n: 25 } });
    expect(levelInfo(12).intro).toEqual({ key: 'intro.timerTighter', vars: { n: 18 } });
    // Рост партии с мягким лимитом называется ростом партии.
    expect(levelInfo(8).intro).toEqual({ key: 'intro.questions', vars: { n: 9 } });
    expect(levelInfo(8).field).toEqual({ key: 'level.field', vars: { n: 9 } });
    // Золото — ноль ошибок: подпись «без ошибок», без числа.
    expect(levelInfo(7).goldHint).toEqual({ key: 'level.goldHintPerfect', vars: {} });
  });
});
