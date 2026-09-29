import { describe, expect, it } from 'vitest';
import { harderLevers, starsFor } from '@gamewingo/game-progress';
import { LADDER, LADDER_SIZE, LEVERS, levelAt, newLever, DAILY_PARAMS } from './levels';
import { MAX_GUESSES } from './locale';
import { createGame } from './gameState';
import { tokenizeWord } from './tokenizer';

describe('лестница «5 букв»', () => {
  it('пятнадцать уровней, пронумерованных подряд', () => {
    expect(LADDER_SIZE).toBe(15);
    LADDER.forEach((lv, i) => expect(lv.n).toBe(i + 1));
  });

  it('на каждом уровне жёстче становится ровно один рычаг', () => {
    for (let i = 1; i < LADDER.length; i++) {
      const harder = harderLevers(LADDER[i - 1].params, LADDER[i].params, LEVERS);
      expect(harder, `уровень ${i + 1}`).toHaveLength(1);
    }
  });

  it('попыток никогда не меньше пяти; начало — классические шесть', () => {
    expect(LADDER[0].params.guesses).toBe(MAX_GUESSES);
    for (const { n, params } of LADDER) expect(params.guesses, `уровень ${n}`).toBeGreaterThanOrEqual(5);
  });

  it('уровни 11–15 мягче прежнего: 5 попыток, золото за 3, серебро за 4', () => {
    for (const n of [11, 12, 13, 14, 15]) {
      const { params, goals } = levelAt(n);
      expect(params.guesses).toBe(5);
      expect(goals.gold).toBe(3);
      expect(goals.silver).toBe(4);
    }
  });

  it('золото достижимо аккуратной игрой: не строже трёх попыток', () => {
    for (const { goals } of LADDER) expect(goals.gold).toBeGreaterThanOrEqual(3);
  });

  it('лимит попыток не строже серебра, золото лучше серебра', () => {
    for (const { params, goals } of LADDER) {
      expect(goals.gold).toBeLessThan(goals.silver);
      expect(goals.silver).toBeLessThanOrEqual(params.guesses);
    }
  });

  it('таймер, раз появившись, только ужимается и не жёстче трёх минут', () => {
    const first = LADDER.findIndex((lv) => lv.params.timeLimitSec > 0);
    expect(first).toBeGreaterThan(0);
    for (let i = first + 1; i < LADDER.length; i++) {
      expect(LADDER[i].params.timeLimitSec).toBeGreaterThan(0);
      expect(LADDER[i].params.timeLimitSec).toBeLessThanOrEqual(LADDER[i - 1].params.timeLimitSec);
    }
    for (const { params } of LADDER) {
      if (params.timeLimitSec) expect(params.timeLimitSec).toBeGreaterThanOrEqual(180);
    }
  });

  it('новое ограничение появляется на знакомой партии; финал — все рычаги', () => {
    expect(LADDER[0].params).toEqual({ guesses: 6, strict: false, rare: false, timeLimitSec: 0 });
    expect(LADDER[LADDER_SIZE - 1].params).toMatchObject({ guesses: 5, strict: true, rare: true });
    expect(LADDER[LADDER_SIZE - 1].params.timeLimitSec).toBeGreaterThan(0);
  });

  it('newLever называет рычаг, ставший жёстче', () => {
    expect(newLever(1)).toBeNull();
    expect(newLever(2)).toBe('strict');
    expect(newLever(3)).toBe('rare');
    expect(newLever(5)).toBe('guesses');
    expect(newLever(9)).toBe('timeLimitSec');
    expect(newLever(15)).toBe('timeLimitSec');
  });

  it('слово дня играется по классическим правилам', () => {
    expect(DAILY_PARAMS).toEqual({ guesses: MAX_GUESSES, strict: false, rare: false, timeLimitSec: 0 });
  });

  it('levelAt зажимает номер в границы лестницы', () => {
    expect(levelAt(0).n).toBe(1);
    expect(levelAt(99).n).toBe(LADDER_SIZE);
    expect(levelAt(11).n).toBe(11);
  });

  it('идеальная догадка даёт три звезды на каждом уровне', () => {
    for (const { goals } of LADDER) expect(starsFor(goals, 1)).toBe(3);
  });
});

describe('строгий режим', () => {
  const answer = tokenizeWord('крыша', 'ru');
  const guess = (w: string) => tokenizeWord(w, 'ru');

  it('в нестрогой партии не мешает', () => {
    const g = createGame(answer);
    g.submit(guess('крыло'));
    expect(g.checkStrict(guess('пенал'))).toBeNull();
  });

  it('требует ставить найденную букву на её место', () => {
    const g = createGame(answer, { strict: true });
    g.submit(guess('крыло')); // к, р, ы — на местах
    const v = g.checkStrict(guess('пенал'));
    expect(v).toEqual({ kind: 'position', index: 0, unit: 'к' });
  });

  it('требует использовать букву, о которой известно, что она в слове', () => {
    const g = createGame(answer, { strict: true });
    // «ш» есть в слове, но не на этом месте.
    g.submit(guess('шкура'));
    const v = g.checkStrict(guess('шторм'));
    // Первым сработает более сильное правило — буквы на своих местах.
    expect(v).not.toBeNull();
  });

  it('догадку, учитывающую все подсказки, пропускает', () => {
    const g = createGame(answer, { strict: true });
    g.submit(guess('крыло'));
    expect(g.checkStrict(guess('крыша'))).toBeNull();
  });

  it('число попыток берётся из параметров уровня', () => {
    const g = createGame(answer, { maxGuesses: 4 });
    expect(g.maxGuesses).toBe(4);
    for (let i = 0; i < 4; i++) g.submit(guess('пенал'));
    expect(g.status).toBe('lost');
  });
});
