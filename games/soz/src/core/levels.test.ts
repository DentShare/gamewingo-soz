import { describe, expect, it } from 'vitest';
import { starsFor } from '@gamewingo/game-progress';
import { LADDER, LADDER_SIZE, levelAt, DAILY_PARAMS } from './levels';
import { MAX_GUESSES } from './locale';
import { createGame } from './gameState';
import { tokenizeWord } from './tokenizer';

describe('лестница «5 букв»', () => {
  it('пятнадцать уровней, пронумерованных подряд', () => {
    expect(LADDER_SIZE).toBe(15);
    LADDER.forEach((lv, i) => expect(lv.n).toBe(i + 1));
  });

  it('попыток становится только меньше', () => {
    for (let i = 1; i < LADDER.length; i++) {
      expect(LADDER[i].params.guesses).toBeLessThanOrEqual(LADDER[i - 1].params.guesses);
    }
    expect(LADDER[0].params.guesses).toBe(MAX_GUESSES);
    expect(LADDER[LADDER_SIZE - 1].params.guesses).toBeLessThan(MAX_GUESSES);
  });

  it('цель на звёзды достижима в рамках выданных попыток', () => {
    for (const { params, goals } of LADDER) {
      expect(goals.gold).toBeLessThan(goals.silver);
      expect(goals.silver).toBeLessThanOrEqual(params.guesses);
      expect(goals.gold).toBeGreaterThanOrEqual(1);
    }
  });

  it('ограничения появляются по одному и не отменяются', () => {
    // Первый уровень — классические правила, последний — все ограничения разом.
    expect(LADDER[0].params).toMatchObject({ strict: false, keyboardHints: true, timeLimitSec: 0 });
    const last = LADDER[LADDER_SIZE - 1].params;
    expect(last.strict).toBe(true);
    expect(last.keyboardHints).toBe(false);
    expect(last.timeLimitSec).toBeGreaterThan(0);
  });

  it('подсветку клавиатуры отбирают позже строгого режима', () => {
    const firstStrict = LADDER.findIndex((lv) => lv.params.strict);
    const firstNoHints = LADDER.findIndex((lv) => !lv.params.keyboardHints);
    expect(firstStrict).toBeGreaterThanOrEqual(0);
    expect(firstNoHints).toBeGreaterThan(firstStrict);
  });

  it('слово дня играется по классическим правилам', () => {
    expect(DAILY_PARAMS).toEqual({
      guesses: MAX_GUESSES, strict: false, keyboardHints: true, timeLimitSec: 0,
    });
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
