export interface ScoreInput {
  /** Пройденные проёмы. */
  passed: number;
  durationMs: number;
}

/** Очки за один пройденный проём. */
export const POINTS_PER_GAP = 100;
/** Потолок бонуса за выживание (чтобы «болтаться» было невыгодно). */
export const MAX_TIME_BONUS = 200;
/**
 * Жёсткий потолок для серверного антифрода: результат выше — отклонять.
 * Реально достижимый максимум за партию много ниже (скорость растёт, партия ~20–60 сек).
 */
export const MAX_SCORE = 100000;

/**
 * Очки: 100 за каждый пройденный проём + небольшой бонус за время в воздухе.
 * Начисление баллов лояльности — ТОЛЬКО на сервере, игра лишь сообщает результат.
 */
export function computeScore({ passed, durationMs }: ScoreInput): number {
  if (passed <= 0) return 0;
  const base = passed * POINTS_PER_GAP;
  const sec = Math.max(0, Math.floor(durationMs / 1000));
  const timeBonus = Math.min(MAX_TIME_BONUS, sec * 2);
  return Math.min(MAX_SCORE, base + timeBonus);
}
