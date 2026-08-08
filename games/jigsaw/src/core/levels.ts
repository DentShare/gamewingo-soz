import type { LevelDef, StarGoals } from '@gamewingo/game-progress';
import { PICTURES } from './pictures';

/**
 * Лестница пазла: пятнадцать картинок от четырёх кусочков до двадцати.
 *
 * Игра для 3–7 лет, проиграть нельзя: кусочек, положенный не туда, спокойно
 * возвращается в лоток. Звёзды считаются по числу таких промахов, а не по
 * времени — детей нельзя торопить.
 *
 * Подсказка-контур (бледная картинка под полем) держится до девятого уровня,
 * дальше собирать приходится по памяти.
 */

export interface JigsawParams {
  /** Кусочков по горизонтали и вертикали. */
  cols: number;
  rows: number;
  /** id картинки из манифеста. */
  picture: string;
  /** Показывать ли бледную картинку-подсказку под полем. */
  ghost: boolean;
}

export type JigsawLevel = LevelDef<JigsawParams>;

/** [колонок, строк, подсказка, золото по промахам, серебро по промахам]. */
const TABLE: Array<[number, number, boolean, number, number]> = [
  [2, 2, true, 0, 2],
  [2, 3, true, 0, 2],
  [3, 3, true, 1, 3],
  [3, 3, true, 1, 3],
  [3, 4, true, 1, 4],
  [3, 4, true, 2, 4],
  [4, 4, true, 2, 5],
  [4, 4, true, 2, 5],
  [4, 4, false, 2, 5],
  [4, 5, false, 3, 6],
  [4, 5, false, 3, 6],
  [4, 5, false, 3, 7],
  [4, 5, false, 4, 8],
  [4, 5, false, 4, 8],
  [4, 5, false, 4, 8],
];

export const LADDER: readonly JigsawLevel[] = TABLE.map(([cols, rows, ghost, gold, silver], i) => {
  const goals: StarGoals = { gold, silver };
  // Картинка своя на каждом уровне — новая история как награда за сборку.
  const picture = PICTURES[i % PICTURES.length].id;
  return { n: i + 1, params: { cols, rows, picture, ghost }, goals };
});

export const LADDER_SIZE = LADDER.length;

/** Уровень по номеру. Номер вне лестницы зажимается — реестр мог сохранить старое значение. */
export function levelAt(n: number): JigsawLevel {
  return LADDER[Math.min(LADDER_SIZE, Math.max(1, Math.round(n))) - 1];
}
