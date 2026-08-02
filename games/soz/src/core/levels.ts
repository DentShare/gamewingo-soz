import type { LevelDef, StarGoals } from '@gamewingo/game-progress';
import { MAX_GUESSES } from './locale';

/**
 * Лестница «5 букв»: пятнадцать уровней от шести спокойных попыток
 * до четырёх без подсветки клавиатуры и с таймером.
 *
 * Словарь один — пятибуквенный, поэтому длину слова менять нельзя. Сложность
 * растёт тем, что отбирают у игрока: попытки, право на нелогичный ход
 * (строгий режим), подсветку клавиатуры и, наконец, время.
 */

export interface SozParams {
  /** Сколько попыток даётся; по умолчанию шесть, к концу лестницы четыре. */
  guesses: number;
  /**
   * Строгий режим: каждая догадка обязана учитывать уже открытые подсказки —
   * найденные буквы стоят на своих местах, а «жёлтые» присутствуют в слове.
   */
  strict: boolean;
  /** Подсвечивать ли статусы букв на клавиатуре. Без подсветки нужно помнить самому. */
  keyboardHints: boolean;
  /** Потолок времени в секундах; 0 — без таймера. */
  timeLimitSec: number;
}

export type SozLevel = LevelDef<SozParams>;

/** [попыток, строгий режим, подсветка клавиатуры, лимит времени, золото, серебро] — золото и серебро по числу использованных попыток. */
const TABLE: Array<[number, boolean, boolean, number, number, number]> = [
  [6, false, true, 0, 3, 5],
  [6, false, true, 0, 3, 5],
  [6, false, true, 0, 3, 4],
  [6, true, true, 0, 3, 5],
  [6, true, true, 0, 3, 4],
  [5, false, true, 0, 3, 4],
  [5, true, true, 0, 3, 4],
  [5, true, true, 240, 3, 4],
  [5, true, false, 0, 3, 4],
  [5, true, false, 210, 3, 4],
  [4, false, true, 0, 2, 3],
  [4, true, true, 0, 2, 3],
  [4, true, true, 180, 2, 3],
  [4, true, false, 0, 2, 3],
  [4, true, false, 150, 2, 3],
];

export const LADDER: readonly SozLevel[] = TABLE.map(
  ([guesses, strict, keyboardHints, timeLimitSec, gold, silver], i) => {
    const goals: StarGoals = { gold, silver };
    return { n: i + 1, params: { guesses, strict, keyboardHints, timeLimitSec }, goals };
  },
);

export const LADDER_SIZE = LADDER.length;

/** Уровень по номеру. Номер вне лестницы зажимается — реестр мог сохранить старое значение. */
export function levelAt(n: number): SozLevel {
  return LADDER[Math.min(LADDER_SIZE, Math.max(1, Math.round(n))) - 1];
}

/** Параметры слова дня: классические правила без ограничений лестницы. */
export const DAILY_PARAMS: SozParams = {
  guesses: MAX_GUESSES,
  strict: false,
  keyboardHints: true,
  timeLimitSec: 0,
};
