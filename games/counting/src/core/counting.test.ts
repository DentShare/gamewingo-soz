import { describe, it, expect } from 'vitest';
import {
  createCountingGame, countRange, ITEMS,
  MAX_COUNT, MAX_OPTION_DELTA, OPTIONS_COUNT, TOTAL_QUESTIONS,
} from './counting';
import { mulberry32 } from './rng';
import { computeScore } from './score';
import { LADDER } from './levels';
import { starsFor } from '@gamewingo/game-progress';

/** Проходит партию до конца, всегда отвечая верно. Возвращает список количеств. */
function playPerfect(seed: number): number[] {
  const g = createCountingGame(mulberry32(seed));
  const counts: number[] = [];
  while (!g.isDone) {
    counts.push(g.question.count);
    g.answer(g.question.count);
  }
  return counts;
}

describe('createCountingGame', () => {
  it('верный ответ увеличивает correct и меняет вопрос', () => {
    const g = createCountingGame(mulberry32(7));
    const before = g.question;
    const res = g.answer(before.count);
    expect(res).toEqual({ correct: true, done: false });
    expect(g.correct).toBe(1);
    expect(g.mistakes).toBe(0);
    expect(g.question).not.toBe(before);
    expect(g.asked).toBe(2);
  });

  it('неверный ответ увеличивает mistakes и НЕ меняет вопрос (проиграть нельзя)', () => {
    const g = createCountingGame(mulberry32(7));
    const before = g.question;
    const wrong = before.options.find((n) => n !== before.count)!;
    const res = g.answer(wrong);
    expect(res).toEqual({ correct: false, done: false });
    expect(g.mistakes).toBe(1);
    expect(g.correct).toBe(0);
    expect(g.question).toBe(before);
    expect(g.asked).toBe(1);
    // После подсказки можно ответить снова — верный ответ засчитывается.
    expect(g.answer(before.count).correct).toBe(true);
    expect(g.correct).toBe(1);
    expect(g.mistakes).toBe(1);
  });

  it('options: содержат правильный ответ, без дубликатов, постоянной длины', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = createCountingGame(mulberry32(seed));
      while (!g.isDone) {
        const q = g.question;
        expect(q.options).toContain(q.count);
        expect(new Set(q.options).size).toBe(q.options.length);
        expect(q.options.length).toBe(OPTIONS_COUNT);
        g.answer(q.count);
      }
    }
  });

  it('options состоят из чисел, близких к правильному, и лежат в 1..MAX_COUNT', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = createCountingGame(mulberry32(seed));
      while (!g.isDone) {
        const q = g.question;
        for (const n of q.options) {
          expect(Math.abs(n - q.count)).toBeLessThanOrEqual(MAX_OPTION_DELTA);
          expect(n).toBeGreaterThanOrEqual(1);
          expect(n).toBeLessThanOrEqual(MAX_COUNT);
        }
        g.answer(q.count);
      }
    }
  });

  it('itemIndex указывает на существующий предмет', () => {
    const g = createCountingGame(mulberry32(11));
    while (!g.isDone) {
      expect(g.question.itemIndex).toBeGreaterThanOrEqual(0);
      expect(g.question.itemIndex).toBeLessThan(ITEMS.length);
      g.answer(g.question.count);
    }
  });

  it('count не превышает максимум и растёт по ходу партии (фиксированный seed)', () => {
    const counts = playPerfect(2024);
    expect(counts.length).toBe(TOTAL_QUESTIONS);
    counts.forEach((c, i) => {
      const [min, max] = countRange(i, TOTAL_QUESTIONS, MAX_COUNT);
      expect(c).toBeGreaterThanOrEqual(min);
      expect(c).toBeLessThanOrEqual(max);
      expect(c).toBeLessThanOrEqual(MAX_COUNT);
    });
    const firstMax = Math.max(...counts.slice(0, 3));
    const lastMin = Math.min(...counts.slice(6));
    expect(firstMax).toBeLessThanOrEqual(lastMin); // первые вопросы не сложнее поздних
    const avg = (a: number[]) => a.reduce((s, n) => s + n, 0) / a.length;
    expect(avg(counts.slice(6))).toBeGreaterThan(avg(counts.slice(0, 3)));
  });

  it('countRange растёт монотонно', () => {
    for (let i = 1; i < TOTAL_QUESTIONS; i++) {
      const [minPrev, maxPrev] = countRange(i - 1, TOTAL_QUESTIONS, MAX_COUNT);
      const [min, max] = countRange(i, TOTAL_QUESTIONS, MAX_COUNT);
      expect(min).toBeGreaterThanOrEqual(minPrev);
      expect(max).toBeGreaterThanOrEqual(maxPrev);
    }
  });

  it('после 10 верных ответов партия завершена', () => {
    const g = createCountingGame(mulberry32(3));
    for (let i = 0; i < TOTAL_QUESTIONS - 1; i++) {
      expect(g.answer(g.question.count).done).toBe(false);
    }
    expect(g.answer(g.question.count)).toEqual({ correct: true, done: true });
    expect(g.isDone).toBe(true);
    expect(g.correct).toBe(TOTAL_QUESTIONS);
    expect(g.asked).toBe(TOTAL_QUESTIONS);
  });

  it('ошибки не мешают дойти до конца — их можно сделать сколько угодно', () => {
    const g = createCountingGame(mulberry32(5));
    for (let i = 0; i < TOTAL_QUESTIONS; i++) {
      const q = g.question;
      const wrong = q.options.find((n) => n !== q.count)!;
      g.answer(wrong);
      g.answer(q.count);
    }
    expect(g.isDone).toBe(true);
    expect(g.correct).toBe(TOTAL_QUESTIONS);
    expect(g.mistakes).toBe(TOTAL_QUESTIONS);
  });

  it('после завершения answer ничего не меняет', () => {
    const g = createCountingGame(mulberry32(9));
    while (!g.isDone) g.answer(g.question.count);
    const snapshot = { q: g.question, correct: g.correct, mistakes: g.mistakes, asked: g.asked };
    expect(g.answer(g.question.count)).toEqual({ correct: false, done: true });
    expect(g.answer(999)).toEqual({ correct: false, done: true });
    expect(g.question).toBe(snapshot.q);
    expect(g.correct).toBe(snapshot.correct);
    expect(g.mistakes).toBe(snapshot.mistakes);
    expect(g.asked).toBe(snapshot.asked);
  });

  it('детерминированность по seed', () => {
    const a = createCountingGame(mulberry32(1234));
    const b = createCountingGame(mulberry32(1234));
    for (let i = 0; i < TOTAL_QUESTIONS; i++) {
      expect(a.question).toEqual(b.question);
      a.answer(a.question.count);
      b.answer(b.question.count);
    }
    expect(playPerfect(77)).toEqual(playPerfect(77));
    expect(playPerfect(77)).not.toEqual(playPerfect(78));
  });
});

describe('score', () => {
  it('без ошибок — максимум, ошибки уменьшают бонус', () => {
    expect(computeScore({ correct: 10, mistakes: 0 })).toBe(1300);
    expect(computeScore({ correct: 10, mistakes: 2 })).toBe(1100);
    expect(computeScore({ correct: 10, mistakes: 7 })).toBe(1000);
  });

  it('не превышает антифрод-потолок 1300', () => {
    for (let m = 0; m <= 30; m++) {
      expect(computeScore({ correct: TOTAL_QUESTIONS, mistakes: m })).toBeLessThanOrEqual(1300);
    }
  });

  it('звёзды по ошибкам', () => {
    const goals = LADDER[4].goals;
    expect(starsFor(goals, 0)).toBe(3);
    expect(starsFor(goals, goals.silver)).toBe(2);
    expect(starsFor(goals, goals.silver + 1)).toBe(1);
  });
});
