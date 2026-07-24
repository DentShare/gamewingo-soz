export type UnitStatus = 'correct' | 'present' | 'absent';

/** Классический Wordle-алгоритм, но по юнитам. guess и answer — массивы одинаковой длины. */
export function evaluateGuess(guess: string[], answer: string[]): UnitStatus[] {
  const n = answer.length;
  const result: UnitStatus[] = new Array(n).fill('absent');
  const pool = new Map<string, number>();

  // Проход 1: correct + учёт остатка в пуле
  for (let i = 0; i < n; i++) {
    if (guess[i] === answer[i]) {
      result[i] = 'correct';
    } else {
      pool.set(answer[i], (pool.get(answer[i]) ?? 0) + 1);
    }
  }
  // Проход 2: present из оставшегося пула
  for (let i = 0; i < n; i++) {
    if (result[i] === 'correct') continue;
    const left = pool.get(guess[i]) ?? 0;
    if (left > 0) {
      result[i] = 'present';
      pool.set(guess[i], left - 1);
    }
  }
  return result;
}
