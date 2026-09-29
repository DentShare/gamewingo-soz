import { MAX_GUESSES } from './locale';

/**
 * Статистика слова дня — крюки жанра на экране итога: «сыграно / % побед /
 * серия / лучшая» и распределение попыток. Только слово дня: тренировка
 * (лестница) сюда не пишется, у неё свои звёзды.
 *
 * Чистая логика: хранение — в `persistence.ts` (`loadStats`/`recordDailyStats`).
 */
export interface DailyStats {
  played: number;
  won: number;
  /** Текущая серия отгаданных слов дня подряд (по дням). */
  streak: number;
  bestStreak: number;
  /** distribution[i] — сколько слов отгадано с (i+1)-й попытки. Длина MAX_GUESSES. */
  distribution: number[];
  /** Последний записанный день: повторная запись того же дня ничего не меняет. */
  lastDayId: number | null;
  /** Последний отгаданный день: серия продолжается, только если это «вчера». */
  lastWonDayId: number | null;
}

export interface DailyOutcome {
  dayId: number;
  solved: boolean;
  guessesUsed: number;
}

export function emptyStats(): DailyStats {
  return {
    played: 0, won: 0, streak: 0, bestStreak: 0,
    distribution: Array.from({ length: MAX_GUESSES }, () => 0),
    lastDayId: null, lastWonDayId: null,
  };
}

/**
 * Записать итог слова дня. Один раз на день: запись того же (или более раннего)
 * дня возвращает статистику без изменений — экран итога можно открыть повторно,
 * а сохранённую партию восстановить, не удваивая счётчики.
 *
 * Серия: победа сразу после вчерашней победы — +1, иначе начинается с 1;
 * проигрыш обнуляет. Пропущенный день рвёт серию: следующая победа — снова 1.
 */
export function recordDaily(stats: DailyStats, o: DailyOutcome): DailyStats {
  if (stats.lastDayId !== null && o.dayId <= stats.lastDayId) return stats;
  const next: DailyStats = { ...stats, distribution: stats.distribution.slice(), lastDayId: o.dayId };
  next.played += 1;
  if (o.solved) {
    next.won += 1;
    next.streak = stats.lastWonDayId === o.dayId - 1 ? stats.streak + 1 : 1;
    next.bestStreak = Math.max(stats.bestStreak, next.streak);
    next.lastWonDayId = o.dayId;
    const i = Math.min(MAX_GUESSES, Math.max(1, Math.round(o.guessesUsed))) - 1;
    next.distribution[i] += 1;
  } else {
    next.streak = 0;
  }
  return next;
}

/**
 * Серия на день `today`: если последняя победа была раньше вчерашнего дня,
 * серия уже порвана, хотя в хранилище ещё лежит старое число.
 */
export function streakOn(stats: DailyStats, today: number): number {
  if (stats.lastWonDayId === null || stats.lastWonDayId < today - 1) return 0;
  return stats.streak;
}

/** Процент побед, целый; 0 — если ещё не играли. */
export function winPercent(stats: DailyStats): number {
  return stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
}

/** Привести сохранённое (возможно, старое или битое) значение к форме `DailyStats`. */
export function sanitizeStats(raw: unknown): DailyStats {
  const base = emptyStats();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Record<keyof DailyStats, unknown>>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const day = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const dist = Array.isArray(r.distribution) ? r.distribution : [];
  return {
    played: num(r.played),
    won: num(r.won),
    streak: num(r.streak),
    bestStreak: num(r.bestStreak),
    distribution: base.distribution.map((_, i) => num(dist[i])),
    lastDayId: day(r.lastDayId),
    lastWonDayId: day(r.lastWonDayId),
  };
}
