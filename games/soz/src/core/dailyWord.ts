const TASHKENT_OFFSET_MS = 5 * 3600 * 1000; // UTC+5, без DST
const DAY_MS = 86_400_000;

/** Номер дня по таймзоне Asia/Tashkent. nowMs по умолчанию Date.now(). Сервер считает так же. */
export function computeDayId(nowMs: number = Date.now()): number {
  return Math.floor((nowMs + TASHKENT_OFFSET_MS) / DAY_MS);
}

/** Детерминированный 32-битный fmix-хэш dayId → индекс в [0, len). */
export function dailyIndex(dayId: number, len: number): number {
  let h = dayId >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return h % len;
}

export function pickDailyWord(answers: string[], dayId: number = computeDayId()): string {
  return answers[dailyIndex(dayId, answers.length)];
}
