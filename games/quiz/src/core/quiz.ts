import { shuffle } from './rng';
import { ALL_QUESTIONS, questionsOf, type Localized, type Question, type TopicId } from '../content';

/**
 * Чистая логика викторины: колода вопросов на партию, перемешанные варианты,
 * счёт верных и ошибок, лимит ошибок. Без Phaser и DOM.
 */

export interface QuizOptions {
  /** Сколько вопросов в партии. */
  questions: number;
  /** Сколько вариантов показывать. Если у вопроса их меньше — показываем сколько есть. */
  options: number;
  /** Сколько ошибок допустимо до провала. */
  maxMistakes: number;
  /** Из каких тем берём вопросы. Пустой список — весь банк. */
  topics: readonly TopicId[];
}

/** Вопрос в том виде, в каком его видит игрок: варианты уже перемешаны. */
export interface RoundQuestion {
  id: string;
  topic: TopicId;
  q: Localized;
  options: Localized[];
  /** Индекс верного варианта в перемешанном списке. */
  answer: number;
  fact: Localized;
}

export interface AnswerResult {
  correct: boolean;
  /** Индекс верного варианта — чтобы подсветить его при ошибке. */
  answer: number;
  fact: Localized;
  /** Это был последний вопрос партии (или исчерпан лимит ошибок). */
  last: boolean;
}

export interface QuizGame {
  readonly total: number;
  /** Номер текущего вопроса, 0-based. */
  readonly index: number;
  readonly current: RoundQuestion;
  readonly correct: number;
  readonly mistakes: number;
  readonly isOver: boolean;
  /** Партия провалена: ошибок больше, чем позволяет уровень. */
  readonly failed: boolean;
  /** Ответ игрока. Повторный ответ на тот же вопрос игнорируется. */
  answer(option: number): AnswerResult;
  /** Время на вопрос вышло — засчитывается как ошибка. */
  timeout(): AnswerResult;
  /** Перейти к следующему вопросу. false — партия закончилась. */
  next(): boolean;
}

/** Собирает колоду партии: вопросы из заданных тем, без повторов внутри партии. */
export function buildDeck(opts: QuizOptions, rnd: () => number): Question[] {
  const pool = opts.topics.length
    ? opts.topics.flatMap((t) => questionsOf(t))
    : [...ALL_QUESTIONS];
  const shuffled = shuffle(pool, rnd);
  // Вопросов в теме может не хватить на длинную партию — добираем из общего банка.
  if (shuffled.length < opts.questions) {
    const seen = new Set(shuffled.map((q) => q.id));
    for (const q of shuffle(ALL_QUESTIONS, rnd)) {
      if (shuffled.length >= opts.questions) break;
      if (!seen.has(q.id)) {
        seen.add(q.id);
        shuffled.push(q);
      }
    }
  }
  return shuffled.slice(0, Math.max(1, opts.questions));
}

/**
 * Готовит вопрос к показу: берёт верный вариант и нужное число неверных,
 * перемешивает их и запоминает, где оказался верный.
 */
export function prepare(question: Question, optionCount: number, rnd: () => number): RoundQuestion {
  const [right, ...wrong] = question.options;
  const take = Math.max(1, Math.min(optionCount, question.options.length) - 1);
  const chosen = shuffle(wrong, rnd).slice(0, take);
  const options = shuffle([right, ...chosen], rnd);
  return {
    id: question.id,
    topic: question.topic,
    q: question.q,
    options,
    answer: options.indexOf(right),
    fact: question.fact,
  };
}

export function createQuizGame(opts: QuizOptions, rnd: () => number = Math.random): QuizGame {
  const deck = buildDeck(opts, rnd).map((q) => prepare(q, opts.options, rnd));

  let index = 0;
  let correct = 0;
  let mistakes = 0;
  let over = false;
  /** На текущий вопрос уже ответили — ждём next(). */
  let answered = false;

  const failed = () => mistakes > opts.maxMistakes;

  const finish = (isCorrect: boolean): AnswerResult => {
    answered = true;
    const last = index >= deck.length - 1 || failed();
    if (last) over = true;
    return { correct: isCorrect, answer: deck[index].answer, fact: deck[index].fact, last };
  };

  return {
    get total() { return deck.length; },
    get index() { return index; },
    get current() { return deck[index]; },
    get correct() { return correct; },
    get mistakes() { return mistakes; },
    get isOver() { return over; },
    get failed() { return failed(); },

    answer(option: number): AnswerResult {
      if (answered || over) {
        return { correct: false, answer: deck[index].answer, fact: deck[index].fact, last: over };
      }
      const isCorrect = option === deck[index].answer;
      if (isCorrect) correct++; else mistakes++;
      return finish(isCorrect);
    },

    timeout(): AnswerResult {
      if (answered || over) {
        return { correct: false, answer: deck[index].answer, fact: deck[index].fact, last: over };
      }
      mistakes++;
      return finish(false);
    },

    next(): boolean {
      if (over || index >= deck.length - 1) {
        over = true;
        return false;
      }
      index++;
      answered = false;
      return true;
    },
  };
}
