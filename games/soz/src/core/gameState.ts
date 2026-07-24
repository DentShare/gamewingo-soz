import { evaluateGuess, type UnitStatus } from './evaluate';
import { MAX_GUESSES } from './locale';

export type GameStatus = 'in_progress' | 'won' | 'lost';
export interface Row { units: string[]; statuses: UnitStatus[]; }

const RANK: Record<UnitStatus, number> = { absent: 0, present: 1, correct: 2 };

export interface Game {
  readonly answer: string[];
  status: GameStatus;
  readonly rows: Row[];
  readonly guessesUsed: number;
  submit(guess: string[]): Row;
  letterStatus(unit: string): UnitStatus | undefined;
}

export function createGame(answer: string[]): Game {
  const rows: Row[] = [];
  const keyStatus = new Map<string, UnitStatus>();
  let status: GameStatus = 'in_progress';

  return {
    answer,
    get status() { return status; },
    set status(s) { status = s; },
    rows,
    get guessesUsed() { return rows.length; },
    submit(guess) {
      if (status !== 'in_progress') throw new Error('game already finished');
      const statuses = evaluateGuess(guess, answer);
      const row: Row = { units: guess.slice(), statuses };
      rows.push(row);
      guess.forEach((u, i) => {
        const prev = keyStatus.get(u);
        if (prev === undefined || RANK[statuses[i]] > RANK[prev]) keyStatus.set(u, statuses[i]);
      });
      if (statuses.every((s) => s === 'correct')) status = 'won';
      else if (rows.length >= MAX_GUESSES) status = 'lost';
      return row;
    },
    letterStatus(unit) { return keyStatus.get(unit); },
  };
}
