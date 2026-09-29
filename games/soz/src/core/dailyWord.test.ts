import { describe, it, expect } from 'vitest';
import {
  computeDayId, dailyIndex, pickDailyWord, epochOrder, msUntilNextDay, formatCountdown, dayDate,
} from './dailyWord';
import ansRu from '../data/answers.ru.json';
import ansUz from '../data/answers.uz.json';

const DAY_MS = 86_400_000;
const HOUR = 3_600_000;

describe('computeDayId', () => {
  it('целые дни по Asia/Tashkent (UTC+5)', () => {
    const ms = Date.UTC(2026, 6, 24, 0, 0, 0);
    expect(computeDayId(ms)).toBe(Math.floor((ms + 5 * 3600 * 1000) / 86_400_000));
  });
  it('день меняется в полночь по Ташкенту — в 19:00 UTC', () => {
    const before = Date.UTC(2026, 8, 28, 18, 59, 59);
    const after = Date.UTC(2026, 8, 28, 19, 0, 0);
    expect(computeDayId(after)).toBe(computeDayId(before) + 1);
  });
});

describe('отсчёт до нового слова', () => {
  it('в 18:00 UTC до смены слова ровно час', () => {
    expect(msUntilNextDay(Date.UTC(2026, 8, 28, 18, 0, 0))).toBe(HOUR);
  });
  it('сразу после полуночи по Ташкенту — почти сутки', () => {
    expect(msUntilNextDay(Date.UTC(2026, 8, 28, 19, 0, 0))).toBe(DAY_MS);
    expect(msUntilNextDay(Date.UTC(2026, 8, 28, 19, 0, 1))).toBe(DAY_MS - 1000);
  });
  it('конец отсчёта — ровно следующий dayId', () => {
    for (const now of [Date.UTC(2026, 0, 1, 3, 17, 5), Date.UTC(2026, 11, 31, 22, 0, 0)]) {
      const left = msUntilNextDay(now);
      expect(left).toBeGreaterThan(0);
      expect(left).toBeLessThanOrEqual(DAY_MS);
      expect(computeDayId(now + left)).toBe(computeDayId(now) + 1);
      expect(computeDayId(now + left - 1)).toBe(computeDayId(now));
    }
  });
  it('формат HH:MM:SS, секунды вверх', () => {
    expect(formatCountdown(6 * HOUR + 12 * 60_000 + 44_000)).toBe('06:12:44');
    expect(formatCountdown(1)).toBe('00:00:01');
    expect(formatCountdown(0)).toBe('00:00:00');
    expect(formatCountdown(DAY_MS)).toBe('24:00:00');
  });
  it('дата дня — календарь Ташкента', () => {
    // 28 сентября 20:00 UTC — в Ташкенте уже 29-е.
    expect(dayDate(computeDayId(Date.UTC(2026, 8, 28, 20, 0, 0)))).toEqual({ day: 29, month: 9 });
    expect(dayDate(computeDayId(Date.UTC(2026, 8, 28, 12, 0, 0)))).toEqual({ day: 28, month: 9 });
  });
});

describe('выбор слова дня кругами', () => {
  it('детерминирован: один dayId → один индекс, в диапазоне [0, len)', () => {
    for (let d = 20000; d < 20400; d++) {
      const idx = dailyIndex(d, 37);
      expect(idx).toBe(dailyIndex(d, 37));
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(37);
    }
  });

  it('закреплённые значения: сервер и все устройства получают те же индексы', () => {
    // Меняются только вместе с алгоритмом — тогда и сервер (если сверяет слово дня) надо менять.
    expect(epochOrder(10, 0)).toEqual([4, 8, 6, 3, 5, 9, 7, 1, 0, 2]);
    expect(epochOrder(10, 1)).toEqual([5, 3, 4, 0, 2, 7, 8, 1, 6, 9]);
    expect(dailyIndex(10, 10)).toBe(5);
    expect(dailyIndex(19, 10)).toBe(9);
  });

  it('внутри круга нет повторов: круг — перестановка всего списка', () => {
    for (const len of [1, 2, 3, 7, 36, 60, 365, 400]) {
      for (const epoch of [0, 1, 54, 55, -1]) {
        const order = epochOrder(len, epoch);
        expect(order).toHaveLength(len);
        expect(new Set(order).size).toBe(len);
      }
      const start = 55 * len;
      const seen = new Set<number>();
      for (let d = start; d < start + len; d++) seen.add(dailyIndex(d, len));
      expect(seen.size).toBe(len);
    }
  });

  it('разные круги идут в разном порядке', () => {
    expect(epochOrder(60, 10)).not.toEqual(epochOrder(60, 11));
  });

  it('на стыке кругов слово возвращается не раньше чем через треть круга', () => {
    for (const len of [7, 36, 60, 365]) {
      const minGap = Math.floor(len / 3) + 1;
      for (let epoch = 50; epoch < 60; epoch++) {
        const last = new Map<number, number>();
        for (let d = epoch * len; d < (epoch + 2) * len; d++) {
          const idx = dailyIndex(d, len);
          const prev = last.get(idx);
          if (prev !== undefined) expect(d - prev, `len ${len}, день ${d}`).toBeGreaterThanOrEqual(minGap);
          last.set(idx, d);
        }
      }
    }
  });

  it('работает и для отрицательных dayId', () => {
    const idx = dailyIndex(-3, 10);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(10);
  });
});

/**
 * «Нет повторов на 365 дней» на настоящих словарях. Круг равен длине списка,
 * поэтому год без повторов получается только при словаре ≥ 365 слов (RU) — до тех
 * пор тест пропускается: это задача контента (T9), а не подгонка теста.
 * Для UZ планка — 200 слов (≈ полгода без повторов).
 */
const YEAR = 365;
describe('словари слова дня', () => {
  const noRepeats = (answers: string[], days: number) => {
    // Весь круг, в котором лежит сегодняшний день: с его первого дня.
    const start = Math.floor(computeDayId(Date.UTC(2026, 8, 29)) / answers.length) * answers.length;
    const words = Array.from({ length: days }, (_, i) => pickDailyWord(answers, start + i));
    expect(new Set(words).size).toBe(days);
  };

  it.skipIf(ansRu.length < YEAR)(
    `RU: ${YEAR} дней подряд без повторов (ждёт словарь ≥ ${YEAR}, сейчас ${ansRu.length})`,
    () => noRepeats(ansRu, YEAR),
  );
  it.skipIf(ansUz.length < 200)(
    `UZ: 200 дней подряд без повторов (ждёт словарь ≥ 200, сейчас ${ansUz.length})`,
    () => noRepeats(ansUz, 200),
  );
  it('пока словарь короче — без повторов весь круг, сколько бы слов ни было', () => {
    noRepeats(ansRu, Math.min(ansRu.length, YEAR));
    noRepeats(ansUz, Math.min(ansUz.length, 200));
  });
  it('в списках ответов нет дублей (иначе круг повторит слово)', () => {
    expect(new Set(ansRu).size).toBe(ansRu.length);
    expect(new Set(ansUz).size).toBe(ansUz.length);
  });
});

describe('pickDailyWord', () => {
  it('возвращает слово из списка по dayId', () => {
    const answers = ['aaaaa', 'bbbbb', 'ccccc'];
    const w = pickDailyWord(answers, 12345);
    expect(answers).toContain(w);
    expect(pickDailyWord(answers, 12345)).toBe(w);
  });
});
