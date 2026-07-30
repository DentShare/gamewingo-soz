const TASHKENT_OFFSET_MS = 5 * 3600 * 1000; // UTC+5, без DST
const DAY_MS = 86_400_000;

/**
 * Номер дня по таймзоне Asia/Tashkent — тот же счёт, что у слова дня в «5 буквах»
 * и у сервера. От него зависят задания дня, поэтому день должен смениться у всех разом.
 */
export function computeDayId(nowMs: number = Date.now()): number {
  return Math.floor((nowMs + TASHKENT_OFFSET_MS) / DAY_MS);
}

/** Детерминированный 32-битный fmix-хэш: одно и то же число даёт один и тот же индекс. */
export function hashIndex(seed: number, len: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return len > 0 ? h % len : 0;
}
