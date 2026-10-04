const TASHKENT_OFFSET_MS = 5 * 3600 * 1000; // UTC+5, без DST
const DAY_MS = 86_400_000;

/**
 * Номер дня по таймзоне Asia/Tashkent. nowMs по умолчанию Date.now(). Сервер считает так же.
 *
 * Граница дня — полночь по Ташкенту, а не по часам устройства: слово дня одно на всех
 * игроков (и на сервер, который принимает результат по `dayId`). Если бы день менялся
 * в локальную полночь, игрок в другой таймзоне или с переведёнными часами получал бы
 * «завтрашнее» слово раньше остальных, а сервер отклонял бы его результат.
 */
export function computeDayId(nowMs: number = Date.now()): number {
  return Math.floor((nowMs + TASHKENT_OFFSET_MS) / DAY_MS);
}

/**
 * Сколько миллисекунд до следующего `dayId` — до полуночи по Ташкенту
 * (для отсчёта «Новое слово через HH:MM:SS»). Та же граница, что в `computeDayId`:
 * отсчёт считает не до локальной полуночи устройства, а до момента, когда
 * слово действительно сменится. Всегда в (0, DAY_MS].
 */
export function msUntilNextDay(nowMs: number = Date.now()): number {
  const nextStart = (computeDayId(nowMs) + 1) * DAY_MS - TASHKENT_OFFSET_MS;
  return nextStart - nowMs;
}

/** «06:12:44» — часы, минуты, секунды обратного отсчёта (секунды округляются вверх). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Календарная дата дня по Ташкенту: для подписи «Слово дня · 28 сентября». */
export function dayDate(dayId: number): { day: number; month: number } {
  // dayId × DAY_MS — полночь ташкентской даты, записанная как UTC: берём UTC-поля.
  const d = new Date(dayId * DAY_MS);
  return { day: d.getUTCDate(), month: d.getUTCMonth() + 1 };
}

/* ── Выбор слова дня ──────────────────────────────────────────────────────────
 *
 * Слова идут кругами: круг (эпоха) = `len` дней подряд, номер круга
 * `floor(dayId / len)`, позиция внутри круга `dayId mod len`. На каждый круг —
 * своя детерминированная перестановка списка, поэтому внутри круга слово не
 * повторяется, пока не пройден весь список (при словаре ≥ 365 — год без повторов
 * от начала круга), а следующий круг идёт в другом порядке.
 *
 * Стык кругов. Независимые перестановки могли бы поставить слово в конец одного
 * круга и в начало следующего — повтор через пару дней. Поэтому первые
 * `floor(len / 3)` мест круга не могут занять слова из последних `floor(len / 3)`
 * мест предыдущего: на стыке слово возвращается не раньше чем через треть круга.
 * Хвост круга правка не трогает — он всегда равен «сырой» перестановке, так что
 * круг k считается без круга k−1 из его же сырой перестановки, без цепочки от нуля.
 *
 * Алгоритм — для сервера, если он станет проверять слово дня:
 *   1. seed = fmix32(epoch) (см. `mix`), генератор mulberry32(seed);
 *   2. Фишер — Йетс по [0..len): for i = len−1..1: j = floor(rnd() × (i+1)); swap(i, j);
 *   3. forbidden = последние T = floor(len/3) элементов сырой перестановки круга epoch−1;
 *      для i в [0, T): если perm[i] ∈ forbidden — поменять с первым j ≥ max(T, j_prev+1),
 *      j < len − T, у которого perm[j] ∉ forbidden.
 * Индексы — позиции в файле ответов, поэтому порядок слов в `answers.*.json`
 * менять нельзя: только дописывать (дописанное слово меняет `len`, а с ним и круги,
 * — делать это между кругами или смириться с перетасовкой будущих дней).
 */

/** 32-битный fmix (из MurmurHash3): соседние эпохи дают несвязанные зёрна. */
function mix(n: number): number {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32 — маленький детерминированный ГПСЧ, одинаковый в любом JS-движке. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rawPermutation(len: number, epoch: number): number[] {
  const perm = Array.from({ length: len }, (_, i) => i);
  const rnd = mulberry32(mix(epoch));
  for (let i = len - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  return perm;
}

const cache = new Map<string, number[]>();

/**
 * Порядок слов в круге `epoch`: перестановка индексов [0, len) с защитой стыка
 * (см. выше). Результат кэшируется — за сеанс нужны один-два круга.
 */
export function epochOrder(len: number, epoch: number): number[] {
  const key = `${len}:${epoch}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const perm = rawPermutation(len, epoch);
  const tail = Math.floor(len / 3);
  if (tail > 0) {
    const forbidden = new Set(rawPermutation(len, epoch - 1).slice(len - tail));
    let j = tail;
    for (let i = 0; i < tail; i++) {
      if (!forbidden.has(perm[i])) continue;
      while (j < len - tail && forbidden.has(perm[j])) j++;
      if (j >= len - tail) break; // не бывает: чистых слов в середине всегда хватает (len ≥ 3T)
      [perm[i], perm[j]] = [perm[j], perm[i]];
      j++;
    }
  }
  if (cache.size > 16) cache.clear();
  cache.set(key, perm);
  return perm;
}

/** Индекс слова дня в списке ответов длины `len`: без повторов, пока не пройден весь круг. */
export function dailyIndex(dayId: number, len: number): number {
  if (len <= 0) throw new Error('empty answers list');
  const epoch = Math.floor(dayId / len);
  const pos = dayId - epoch * len; // mod без отрицательных остатков
  return epochOrder(len, epoch)[pos];
}

export function pickDailyWord(answers: string[], dayId: number = computeDayId()): string {
  return answers[dailyIndex(dayId, answers.length)];
}
