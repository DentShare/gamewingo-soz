import type { Card } from './deck';

export type FlipResult =
  | 'ignored'   // клик по открытой/найденной карте или во время показа промаха
  | 'first'     // открыта первая карта пары
  | 'match'     // пара найдена
  | 'miss'      // не совпало — UI показывает и вызывает closeMiss()
  | 'won';      // найдена последняя пара

/** Чистая логика мемори: две карты за ход, счёт ходов, без таймеров и анимаций. */
export interface PairsGame {
  readonly deck: readonly Card[];
  readonly moves: number;        // завершённых ходов (пар переворотов)
  readonly pairsFound: number;
  readonly totalPairs: number;
  readonly open: readonly number[];   // открытые несовпавшие (0..2)
  isMatched(i: number): boolean;
  flip(i: number): FlipResult;
  /** Закрыть пару после промаха (вызвать после паузы показа). */
  closeMiss(): void;
}

export function createPairsGame(deck: Card[]): PairsGame {
  const matched = new Array<boolean>(deck.length).fill(false);
  let open: number[] = [];
  let moves = 0;
  let pairsFound = 0;
  const totalPairs = deck.length / 2;

  return {
    deck,
    get moves() { return moves; },
    get pairsFound() { return pairsFound; },
    get totalPairs() { return totalPairs; },
    get open() { return open; },
    isMatched: (i) => matched[i],
    flip(i) {
      if (i < 0 || i >= deck.length) return 'ignored';
      if (matched[i] || open.includes(i) || open.length === 2) return 'ignored';
      open.push(i);
      if (open.length === 1) return 'first';
      moves++;
      const [a, b] = open;
      if (deck[a].symbol === deck[b].symbol) {
        matched[a] = matched[b] = true;
        open = [];
        pairsFound++;
        return pairsFound === totalPairs ? 'won' : 'match';
      }
      return 'miss';
    },
    closeMiss() { open = []; },
  };
}
