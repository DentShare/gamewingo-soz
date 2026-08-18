/**
 * Ядро «Сумм»: числовая головоломка на вычёркивание.
 *
 * Правила: в сетке чисел справа от каждой строки и снизу под каждым столбцом
 * написана целевая сумма. Нужно вычеркнуть лишние числа так, чтобы оставшиеся
 * в каждой строке и каждом столбце давали ровно свою сумму.
 *
 * Главное решение генератора: задача строится **от ответа**. Сначала бросаем
 * числа и случайно помечаем часть клеток «оставить», и только потом считаем
 * целевые суммы по помеченным. Поэтому решение существует всегда — генератору
 * не нужен решатель, а игроку не грозит неразрешимая доска.
 *
 * Единственности решения мы не требуем: победа определяется совпадением сумм,
 * а не совпадением с задуманным набором. Нашёл другой набор с теми же суммами —
 * тоже выиграл, и это честно.
 */

export interface PuzzleOptions {
  /** Сторона квадратной сетки. */
  size: number;
  /** Сколько клеток входит в решение (их надо оставить). */
  keep: number;
  /** Максимальный модуль числа в клетке. */
  maxValue: number;
  /** Разрешить отрицательные числа — верхние уровни лестницы. */
  negative?: boolean;
}

export interface Puzzle {
  size: number;
  /** Числа клеток построчно, длина size × size. */
  cells: readonly number[];
  /** true — клетка входит в задуманное решение. Игроку не показывается. */
  solution: readonly boolean[];
  rowTargets: readonly number[];
  colTargets: readonly number[];
  /** Сколько клеток нужно вычеркнуть при идеальной игре. */
  minCrosses: number;
}

/** Случайное ненулевое число: ноль в клетке бессмыслен — вычёркивать его нечего. */
function pick(rnd: () => number, maxValue: number, negative: boolean): number {
  const value = 1 + Math.floor(rnd() * maxValue);
  return negative && rnd() < 0.35 ? -value : value;
}

/**
 * Маска решения: `keep` клеток из size², но так, чтобы в каждой строке и в каждом
 * столбце осталась хотя бы одна клетка и хотя бы одна была вычеркнута. Иначе
 * появляются вырожденные линии — «сумма 0, вычеркни всё», и они читаются как ошибка.
 */
function maskFor(size: number, keep: number, rnd: () => number): boolean[] {
  const total = size * size;
  const target = Math.min(total - size, Math.max(size, keep));

  for (let attempt = 0; attempt < 200; attempt++) {
    const mask = new Array<boolean>(total).fill(false);
    const order = Array.from({ length: total }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (let i = 0; i < target; i++) mask[order[i]] = true;

    let ok = true;
    for (let line = 0; line < size && ok; line++) {
      let rowKeep = 0, colKeep = 0;
      for (let i = 0; i < size; i++) {
        if (mask[line * size + i]) rowKeep++;
        if (mask[i * size + line]) colKeep++;
      }
      ok = rowKeep > 0 && rowKeep < size && colKeep > 0 && colKeep < size;
    }
    if (ok) return mask;
  }

  // Запасной вариант: диагональ оставляем, остальное вычёркиваем — условие
  // «в каждой линии есть и то, и другое» выполняется по построению.
  const mask = new Array<boolean>(total).fill(false);
  for (let i = 0; i < size; i++) mask[i * size + i] = true;
  return mask;
}

/** Собрать задачу. Решение гарантировано по построению. */
export function generate(opts: PuzzleOptions, rnd: () => number): Puzzle {
  const { size, keep, maxValue } = opts;
  const negative = !!opts.negative;
  const total = size * size;

  const cells = Array.from({ length: total }, () => pick(rnd, maxValue, negative));
  const solution = maskFor(size, keep, rnd);

  const rowTargets = new Array<number>(size).fill(0);
  const colTargets = new Array<number>(size).fill(0);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const i = r * size + c;
      if (!solution[i]) continue;
      rowTargets[r] += cells[i];
      colTargets[c] += cells[i];
    }
  }

  return {
    size,
    cells,
    solution,
    rowTargets,
    colTargets,
    minCrosses: solution.filter((keepIt) => !keepIt).length,
  };
}

export type ToggleResult = 'crossed' | 'restored';

export interface SumsGame {
  readonly puzzle: Puzzle;
  /** Вычеркнутые клетки — то, что видит игрок. */
  readonly crossed: readonly boolean[];
  /** Сколько раз игрок трогал клетки: и вычёркивания, и возвраты. */
  readonly moves: number;
  /** Возвраты вычеркнутого — мера сомнений, идёт в подсказку на итоге. */
  readonly undos: number;
  readonly solved: boolean;
  /** Сумма оставшихся чисел строки. */
  rowSum(row: number): number;
  colSum(col: number): number;
  /** Линия сошлась с целью — поле подсвечивает её. */
  rowDone(row: number): boolean;
  colDone(col: number): boolean;
  toggle(index: number): ToggleResult;
}

/** Партия по готовой задаче. Ходы считаются, проигрыша нет — только настойчивость. */
export function createSumsGame(puzzle: Puzzle): SumsGame {
  const { size, cells, rowTargets, colTargets } = puzzle;
  const crossed = new Array<boolean>(size * size).fill(false);
  let moves = 0;
  let undos = 0;

  const rowSum = (row: number): number => {
    let sum = 0;
    for (let c = 0; c < size; c++) {
      const i = row * size + c;
      if (!crossed[i]) sum += cells[i];
    }
    return sum;
  };

  const colSum = (col: number): number => {
    let sum = 0;
    for (let r = 0; r < size; r++) {
      const i = r * size + col;
      if (!crossed[i]) sum += cells[i];
    }
    return sum;
  };

  const solved = (): boolean => {
    for (let i = 0; i < size; i++) {
      if (rowSum(i) !== rowTargets[i]) return false;
      if (colSum(i) !== colTargets[i]) return false;
    }
    return true;
  };

  return {
    puzzle,
    get crossed() { return crossed; },
    get moves() { return moves; },
    get undos() { return undos; },
    get solved() { return solved(); },
    rowSum,
    colSum,
    rowDone: (row) => rowSum(row) === rowTargets[row],
    colDone: (col) => colSum(col) === colTargets[col],
    toggle(index) {
      crossed[index] = !crossed[index];
      moves++;
      if (!crossed[index]) undos++;
      return crossed[index] ? 'crossed' : 'restored';
    },
  };
}
