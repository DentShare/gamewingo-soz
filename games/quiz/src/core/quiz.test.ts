import { describe, expect, it } from 'vitest';
import { buildDeck, createQuizGame, prepare, type QuizOptions } from './quiz';
import { mulberry32 } from './rng';
import { ALL_QUESTIONS, BY_TOPIC, TOPICS, questionsOf } from '../content';
import { LADDER, LADDER_SIZE, levelAt } from './levels';
import { computeScore, MAX_SCORE } from './score';

const rng = () => mulberry32(42);

const opts = (over: Partial<QuizOptions> = {}): QuizOptions => ({
  questions: 5, options: 3, maxMistakes: 5, topics: [], ...over,
});

describe('банк вопросов', () => {
  it('id уникальны по всему банку', () => {
    const ids = ALL_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('в каждой теме не меньше десяти вопросов', () => {
    for (const topic of TOPICS) {
      expect(BY_TOPIC[topic].length, topic).toBeGreaterThanOrEqual(10);
    }
  });

  it('у вопроса минимум три варианта и все они разные', () => {
    for (const q of ALL_QUESTIONS) {
      expect(q.options.length, q.id).toBeGreaterThanOrEqual(3);
      const ru = q.options.map((o) => o.ru);
      expect(new Set(ru).size, q.id).toBe(ru.length);
    }
  });

  it('каждая строка заполнена на обоих языках', () => {
    for (const q of ALL_QUESTIONS) {
      const strings = [q.q, q.fact, ...q.options];
      for (const s of strings) {
        expect(s.ru.trim().length, q.id).toBeGreaterThan(0);
        expect(s.uz.trim().length, q.id).toBeGreaterThan(0);
      }
    }
  });

  it('поле topic вопроса совпадает с темой, в которой он лежит', () => {
    for (const topic of TOPICS) {
      for (const q of BY_TOPIC[topic]) expect(q.topic, q.id).toBe(topic);
    }
  });
});

describe('prepare: подготовка вопроса', () => {
  it('перемешивает варианты и правильно указывает верный', () => {
    const source = questionsOf('space')[0];
    const r = prepare(source, 4, rng());
    expect(r.options).toHaveLength(Math.min(4, source.options.length));
    expect(r.options[r.answer].ru).toBe(source.options[0].ru);
  });

  it('верный вариант остаётся в списке даже при обрезке до трёх', () => {
    for (const source of ALL_QUESTIONS) {
      const r = prepare(source, 3, rng());
      expect(r.options.length, source.id).toBe(Math.min(3, source.options.length));
      expect(r.options[r.answer].ru, source.id).toBe(source.options[0].ru);
    }
  });
});

describe('buildDeck: колода партии', () => {
  it('берёт вопросы только из заданных тем', () => {
    const deck = buildDeck(opts({ topics: ['money'], questions: 6 }), rng());
    expect(deck).toHaveLength(6);
    for (const q of deck) expect(q.topic).toBe('money');
  });

  it('не повторяет вопросы внутри партии', () => {
    const deck = buildDeck(opts({ questions: 10 }), rng());
    expect(new Set(deck.map((q) => q.id)).size).toBe(deck.length);
  });

  it('добирает из общего банка, если в теме не хватает вопросов', () => {
    const deck = buildDeck(opts({ topics: ['money'], questions: 14 }), rng());
    expect(deck).toHaveLength(14);
    expect(new Set(deck.map((q) => q.id)).size).toBe(14);
  });
});

describe('createQuizGame: ход партии', () => {
  it('верный ответ увеличивает счёт, неверный — ошибки', () => {
    const game = createQuizGame(opts(), rng());
    const right = game.answer(game.current.answer);
    expect(right.correct).toBe(true);
    expect(game.correct).toBe(1);
    game.next();
    const wrong = game.answer((game.current.answer + 1) % game.current.options.length);
    expect(wrong.correct).toBe(false);
    expect(game.mistakes).toBe(1);
    // Факт показывается в обоих случаях — ради него игра и существует.
    expect(wrong.fact.ru.length).toBeGreaterThan(0);
  });

  it('повторный ответ на тот же вопрос ничего не меняет', () => {
    const game = createQuizGame(opts(), rng());
    game.answer(game.current.answer);
    game.answer(game.current.answer);
    expect(game.correct).toBe(1);
    expect(game.mistakes).toBe(0);
  });

  it('таймаут засчитывается как ошибка', () => {
    const game = createQuizGame(opts(), rng());
    const res = game.timeout();
    expect(res.correct).toBe(false);
    expect(game.mistakes).toBe(1);
  });

  it('партия заканчивается на последнем вопросе', () => {
    const game = createQuizGame(opts({ questions: 3 }), rng());
    for (let i = 0; i < 2; i++) {
      expect(game.answer(game.current.answer).last).toBe(false);
      expect(game.next()).toBe(true);
    }
    expect(game.answer(game.current.answer).last).toBe(true);
    expect(game.isOver).toBe(true);
    expect(game.next()).toBe(false);
  });

  it('превышение лимита ошибок проваливает партию досрочно', () => {
    const game = createQuizGame(opts({ questions: 8, maxMistakes: 1 }), rng());
    const wrong = () => game.answer((game.current.answer + 1) % game.current.options.length);
    wrong();
    game.next();
    const second = wrong();
    expect(second.last).toBe(true);
    expect(game.failed).toBe(true);
    expect(game.isOver).toBe(true);
  });
});

describe('лестница и очки', () => {
  it('пятнадцать уровней, нумерация по порядку', () => {
    expect(LADDER_SIZE).toBe(15);
    LADDER.forEach((lv, i) => expect(lv.n).toBe(i + 1));
  });

  it('сложность не падает: вопросов не меньше, времени не больше', () => {
    for (let i = 1; i < LADDER.length; i++) {
      const prev = LADDER[i - 1].params;
      const cur = LADDER[i].params;
      expect(cur.questions).toBeGreaterThanOrEqual(prev.questions);
      if (prev.timeLimitSec > 0 && cur.timeLimitSec > 0) {
        expect(cur.timeLimitSec).toBeLessThanOrEqual(prev.timeLimitSec);
      }
    }
  });

  it('лимит ошибок никогда не мешает набрать три звезды', () => {
    for (const lv of LADDER) {
      expect(lv.goals.gold, `уровень ${lv.n}`).toBeLessThanOrEqual(lv.params.maxMistakes);
    }
  });

  it('темы уровня существуют в банке', () => {
    for (const lv of LADDER) {
      for (const t of lv.params.topics) expect(TOPICS).toContain(t);
    }
  });

  it('levelAt зажимает номер в границы лестницы', () => {
    expect(levelAt(0).n).toBe(1);
    expect(levelAt(99).n).toBe(LADDER_SIZE);
  });

  it('MAX_SCORE не меньше любого достижимого результата', () => {
    for (const lv of LADDER) {
      expect(computeScore({ correct: lv.params.questions, mistakes: 0, level: lv.n }))
        .toBeLessThanOrEqual(MAX_SCORE);
    }
  });

  it('ошибки уменьшают счёт, но не делают его отрицательным', () => {
    expect(computeScore({ correct: 5, mistakes: 0 })).toBeGreaterThan(computeScore({ correct: 5, mistakes: 3 }));
    expect(computeScore({ correct: 0, mistakes: 5 })).toBe(0);
  });
});
