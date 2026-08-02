import type { LevelDef, StarGoals } from './ladder.js';

/**
 * Лестница для аркад. У головоломки уровень — это расклад; у аркады раскладов нет,
 * поэтому уровень задаётся **целью** и **фазой старта**.
 *
 * Цель («набери 600 очков», «доживи до 40 секунд») превращает бесконечный забег
 * в проходимую ступень. Фаза старта отвечает за вторую беду бесконечных аркад:
 * без неё каждый забег начинается с одного и того же скучного вступления, которое
 * игрок уже проходил двадцать раз. Поздний уровень стартует сразу в темпе.
 */

export interface ArcadeParams {
  /** Сколько очков нужно набрать, чтобы уровень был пройден. */
  target: number;
  /**
   * С какой фазы кривой сложности начинается забег. Каждая аркада понимает это
   * по-своему: змейка — стартовая длина, башня — начальная скорость,
   * полёт — скорость набегания стен, меткий глаз — размер целей.
   */
  startPhase: number;
}

export type ArcadeLevel = LevelDef<ArcadeParams>;

/**
 * Собирает лестницу аркады: цель растёт от `firstTarget` до `lastTarget`,
 * фаза старта — от нуля до `lastPhase`.
 *
 * Звёзды считаются по набранным очкам (больше — лучше): цель уровня даёт одну
 * звезду, полторы цели — две, двойная цель — три. Так на любом уровне есть
 * причина сыграть ещё раз, даже когда он уже пройден.
 */
export function buildArcadeLadder(
  count: number,
  firstTarget: number,
  lastTarget: number,
  lastPhase: number,
): ArcadeLevel[] {
  return Array.from({ length: count }, (_, i) => {
    const t = count > 1 ? i / (count - 1) : 1;
    // Цель растёт по кривой с ускорением: первые ступени должны браться сходу.
    const target = Math.round(firstTarget + (lastTarget - firstTarget) * t * t);
    const startPhase = Math.round(lastPhase * t);
    const goals: StarGoals = {
      gold: Math.round(target * 2),
      silver: Math.round(target * 1.5),
      higherIsBetter: true,
    };
    return { n: i + 1, params: { target, startPhase }, goals };
  });
}
