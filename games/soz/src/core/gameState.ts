import { evaluateGuess, type UnitStatus } from './evaluate';
import { MAX_GUESSES } from './locale';

export type GameStatus = 'in_progress' | 'won' | 'lost';
export interface Row { units: string[]; statuses: UnitStatus[]; }

const RANK: Record<UnitStatus, number> = { absent: 0, present: 1, correct: 2 };

/** Почему строгий режим отклонил догадку — UI показывает это игроку словами. */
export type StrictViolation =
  | { kind: 'position'; index: number; unit: string }
  | { kind: 'missing'; unit: string };

export interface Game {
  readonly answer: string[];
  status: GameStatus;
  readonly rows: Row[];
  readonly guessesUsed: number;
  /** Сколько попыток всего у этой партии. */
  readonly maxGuesses: number;
  /**
   * Проверка строгого режима: null — догадку принять можно.
   * В нестрогой партии всегда null.
   */
  checkStrict(guess: string[]): StrictViolation | null;
  submit(guess: string[]): Row;
  letterStatus(unit: string): UnitStatus | undefined;
}

export interface GameOptions {
  /** Сколько попыток даётся. По умолчанию классические шесть. */
  maxGuesses?: number;
  /** Строгий режим: догадка обязана учитывать уже открытые подсказки. */
  strict?: boolean;
}

export function createGame(answer: string[], opts: GameOptions = {}): Game {
  const maxGuesses = opts.maxGuesses ?? MAX_GUESSES;
  const strict = opts.strict ?? false;
  const rows: Row[] = [];
  const keyStatus = new Map<string, UnitStatus>();
  let status: GameStatus = 'in_progress';

  /** Буквы, стоящие на своих местах по прошлым ходам: индекс → юнит. */
  const fixed = new Map<number, string>();
  /** Буквы, о которых известно, что они в слове есть (жёлтые и зелёные). */
  const required = new Set<string>();

  return {
    answer,
    get status() { return status; },
    set status(s) { status = s; },
    rows,
    get guessesUsed() { return rows.length; },
    get maxGuesses() { return maxGuesses; },
    checkStrict(guess) {
      if (!strict) return null;
      // Сначала позиции: подсказка «буква стоит здесь» сильнее, чем «буква есть».
      for (const [i, unit] of fixed) {
        if (guess[i] !== unit) return { kind: 'position', index: i, unit };
      }
      for (const unit of required) {
        if (!guess.includes(unit)) return { kind: 'missing', unit };
      }
      return null;
    },
    submit(guess) {
      if (status !== 'in_progress') throw new Error('game already finished');
      const statuses = evaluateGuess(guess, answer);
      const row: Row = { units: guess.slice(), statuses };
      rows.push(row);
      guess.forEach((u, i) => {
        const prev = keyStatus.get(u);
        if (prev === undefined || RANK[statuses[i]] > RANK[prev]) keyStatus.set(u, statuses[i]);
        if (statuses[i] === 'correct') { fixed.set(i, u); required.add(u); }
        else if (statuses[i] === 'present') required.add(u);
      });
      if (statuses.every((s) => s === 'correct')) status = 'won';
      else if (rows.length >= maxGuesses) status = 'lost';
      return row;
    },
    letterStatus(unit) { return keyStatus.get(unit); },
  };
}
