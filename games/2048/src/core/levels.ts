import type { LevelDef, StarGoals } from '@gamewingo/game-progress';

/**
 * Лестница «2048». Здесь не нужна искусственная цель по очкам: у игры уже есть
 * своя естественная лестница — номинал плитки. Уровень пройден, когда собрана
 * заданная плитка, и чем она крупнее, тем дольше и осмысленнее партия.
 *
 * Второй рычаг — стартовый мусор: несколько случайных плиток на поле с самого
 * начала. Он не делает игру нечестной (мусор мелкий и сливается), но убирает
 * скучное вступление, где первые тридцать ходов не требуют ни одного решения.
 */

export interface Grid2048Params {
  /** Номинал плитки, который нужно собрать. */
  targetTile: number;
  /** Сколько лишних плиток лежит на поле в начале партии. */
  startClutter: number;
}

export type Grid2048Level = LevelDef<Grid2048Params>;

/** [плитка-цель, стартовый мусор, золото по очкам, серебро по очкам]. */
const TABLE: Array<[number, number, number, number]> = [
  [64, 0, 900, 600],
  [128, 0, 1800, 1200],
  [128, 2, 2000, 1400],
  [256, 0, 3600, 2600],
  [256, 2, 4000, 2900],
  [256, 4, 4400, 3200],
  [512, 0, 7200, 5400],
  [512, 2, 7800, 5800],
  [512, 4, 8400, 6200],
  [1024, 0, 15_000, 11_000],
  [1024, 3, 16_000, 12_000],
  [1024, 5, 17_000, 13_000],
  [2048, 0, 30_000, 22_000],
  [2048, 3, 32_000, 24_000],
  [2048, 6, 34_000, 26_000],
];

export const LADDER: readonly Grid2048Level[] = TABLE.map(([targetTile, startClutter, gold, silver], i) => {
  const goals: StarGoals = { gold, silver, higherIsBetter: true };
  return { n: i + 1, params: { targetTile, startClutter }, goals };
});

export const LADDER_SIZE = LADDER.length;

/** Уровень по номеру. Номер вне лестницы зажимается — реестр мог сохранить старое значение. */
export function levelAt(n: number): Grid2048Level {
  return LADDER[Math.min(LADDER_SIZE, Math.max(1, Math.round(n))) - 1];
}
