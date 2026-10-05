import { readJson, writeJson } from './storage.js';
import { computeDayId, computeWeekId } from './day.js';
import { dailyMissions, MISSIONS_PER_DAY, type Mission } from './missions.js';
import type { RecordResult } from './progress.js';

/**
 * Кошелёк бонусов — демонстрационный клиентский слой бонусной модели.
 *
 * ВАЖНО: по железным правилам каталога баллы начисляет только сервер.
 * Этот кошелёк — витрина для превью и офлайна: те же тарифы, те же
 * идемпотентные ключи, что будут у сервера. При подключении бэкенда баланс
 * приходит в INIT через мост, а награды подтверждаются `claim()` — UI и
 * анимация остаются теми же, меняется только источник числа.
 */

/** Ключ localStorage. Продублирован в game-ui (чип читает баланс сам). */
const KEY = 'wingo:bonus';

/** Потолок списка выданных ключей — от бесконтрольного роста хранилища. */
const MAX_KEYS = 400;

export interface Wallet {
  balance: number;
  /** Идемпотентные ключи уже выданных наград: повторная выдача невозможна. */
  keys: string[];
  /** Серия ежедневных чек-инов: последний день и её длина. */
  checkin: { last: number; run: number };
}

function load(): Wallet {
  const raw = readJson<Partial<Wallet>>(KEY);
  const c = raw?.checkin;
  return {
    balance: Number(raw?.balance) || 0,
    keys: Array.isArray(raw?.keys) ? raw.keys.filter((k) => typeof k === 'string') : [],
    checkin: { last: Number(c?.last) || 0, run: Number(c?.run) || 0 },
  };
}

function save(w: Wallet): void {
  writeJson(KEY, w);
}

/** Наблюдение за демо-начислениями; мониторинг не влияет на кошелёк. */
function notifyAward(key: string, amount: number): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('wingo:coin-awarded', {
    detail: { key, amount },
  }));
}

/** Текущий баланс бонусов. */
export function bonusBalance(): number {
  return load().balance;
}

/**
 * Тарифы (демо). В проде — конфиг на сервере, чтобы компания меняла цифры
 * без релиза; здесь одна точка правды для превью.
 */
export const TARIFF = {
  /** Закрытое задание дня. */
  mission: 15,
  /** Разгаданное слово дня. */
  daily: 25,
  /** Чек-ин: base × день серии, но не выше cap. 5, 10, 15, 20, 25, 25… */
  checkinBase: 5,
  checkinCap: 25,
  /** Первое прохождение уровня n: поздние ступени дороже. */
  level: (n: number) => 20 + 2 * (Math.max(1, n) - 1),
  /**
   * Первое прохождение «уровня дня» в игре. Игр четырнадцать, но оплачиваются
   * только первые `levelOfDayPerDay` за день: иначе обход каталога ради уровней
   * дня стоил бы 140 и ломал дневной потолок.
   */
  levelOfDay: 10,
  levelOfDayPerDay: 3,
  /** Побитый личный рекорд в любой аркаде — раз в календарную неделю. */
  recordWeek: 20,
  /** Пройдена глава целиком (все её уровни хотя бы на одну звезду). */
  chapterClear: 50,
};

/** Разовая выдача по ключу. true — начислено, false — уже выдавалось. */
export function awardOnce(key: string, amount: number): boolean {
  const w = load();
  if (w.keys.includes(key)) return false;
  w.keys.push(key);
  if (w.keys.length > MAX_KEYS) w.keys.splice(0, w.keys.length - MAX_KEYS);
  w.balance += Math.max(0, Math.round(amount));
  save(w);
  notifyAward(key, Math.max(0, Math.round(amount)));
  return true;
}

export interface CheckinResult {
  amount: number;
  /** Какой это день серии подряд (1, 2, 3…). */
  run: number;
}

/**
 * Ежедневный чек-ин с серией: вчера заходил — серия растёт, пропустил день —
 * начинается заново. Второй заход в тот же день ничего не даёт.
 */
export function claimCheckin(dayId: number = computeDayId()): CheckinResult | null {
  const w = load();
  if (w.checkin.last === dayId) return null;
  const run = w.checkin.last === dayId - 1 ? w.checkin.run + 1 : 1;
  const amount = Math.min(TARIFF.checkinBase * run, TARIFF.checkinCap);
  w.checkin = { last: dayId, run };
  w.balance += amount;
  save(w);
  notifyAward(`checkin-${dayId}`, amount);
  return { amount, run };
}

export interface CheckinPreview {
  /** Чек-ин сегодня уже получен. */
  claimedToday: boolean;
  /** Сколько даст (или дал) сегодняшний чек-ин. */
  today: number;
  /** Сколько даст завтрашний, если не пропустить день. */
  tomorrow: number;
  /** С чего начнётся серия после пропуска — «Пропустите день — серия начнётся с +5». */
  afterGap: number;
  /** День серии: сегодняшний, если чек-ин уже был, иначе тот, что наступит при заходе. */
  run: number;
}

/** Что даст серия чек-инов — для полосы недели и предупреждения о сбросе, без начисления. */
export function checkinPreview(dayId: number = computeDayId()): CheckinPreview {
  const { checkin } = load();
  const amountFor = (run: number) => Math.min(TARIFF.checkinBase * run, TARIFF.checkinCap);
  const claimedToday = checkin.last === dayId;
  const run = claimedToday ? checkin.run : checkin.last === dayId - 1 ? checkin.run + 1 : 1;
  return {
    claimedToday,
    today: amountFor(run),
    tomorrow: amountFor(run + 1),
    afterGap: amountFor(1),
    run,
  };
}

/** Ключи наград, в которые зашит день: по ним считается «начислено сегодня». */
const lodKey = (slug: string, dayId: number) => `lod-${slug}-${dayId}`;
const recordWeekKey = (weekId: number) => `record-week-${weekId}`;
const missionKey = (dayId: number, i: number) => `mission-${dayId}-${i}`;
const wordKey = (dayId: number) => `soz-daily-${dayId}`;

function levelsOfDayClaimed(keys: string[], dayId: number): number {
  const tail = `-${dayId}`;
  return keys.filter((k) => k.startsWith('lod-') && k.endsWith(tail)).length;
}

/**
 * Первое прохождение уровня дня в игре. Сверх дневного лимита — не платится:
 * возвращает null, как и повтор в той же игре.
 */
export function grantLevelOfDay(slug: string, dayId: number = computeDayId()): GrantedBonus | null {
  if (levelsOfDayClaimed(load().keys, dayId) >= TARIFF.levelOfDayPerDay) return null;
  const key = lodKey(slug, dayId);
  return awardOnce(key, TARIFF.levelOfDay) ? { key, amount: TARIFF.levelOfDay } : null;
}

/**
 * Неделя рекордов: побил личный рекорд в любой аркаде — награда, но одна на
 * календарную неделю. Вызывать только на побитом (не первом) рекорде.
 */
export function grantRecordWeek(dayId: number = computeDayId()): GrantedBonus | null {
  const key = recordWeekKey(computeWeekId(dayId));
  return awardOnce(key, TARIFF.recordWeek) ? { key, amount: TARIFF.recordWeek } : null;
}

/**
 * Бонус за главы, которые закрылись целиком. Главы описывает игра (T7), здесь —
 * только правило: все уровни главы пройдены. Ключ по номеру главы (с 1).
 */
export function grantChapterClears(
  slug: string,
  chapters: ReadonlyArray<{ levels: readonly number[] }>,
  isCleared: (n: number) => boolean,
): GrantedBonus[] {
  const granted: GrantedBonus[] = [];
  chapters.forEach((ch, i) => {
    if (!ch.levels.length || !ch.levels.every(isCleared)) return;
    const key = `chapter-${slug}-${i + 1}`;
    if (awardOnce(key, TARIFF.chapterClear)) granted.push({ key, amount: TARIFF.chapterClear });
  });
  return granted;
}

export interface DailyOutlook {
  /** Сколько за день можно получить из ежедневных источников. */
  ceiling: number;
  /** Сколько из них уже получено сегодня. */
  earned: number;
  /** «Ещё сегодня до +N». */
  remaining: number;
}

/**
 * Потолок дня и остаток: чек-ин + задания дня + слово дня + уровни дня, плюс
 * неделя рекордов, пока она не выплачена на этой неделе. Разовые награды
 * (первое прохождение уровня, главы, достижения) в потолок не входят — это не
 * ежедневный доход, а прогресс.
 *
 * Считается из ключей кошелька, а не отдельным счётчиком: кошелёк пишет и хаб
 * (своей копией кода), и лишнее поле он бы при сохранении потерял.
 */
export function dailyOutlook(dayId: number = computeDayId()): DailyOutlook {
  const { keys } = load();
  const has = (k: string) => keys.includes(k);
  const checkin = checkinPreview(dayId);
  const missionsDone = Array.from({ length: MISSIONS_PER_DAY }, (_, i) => missionKey(dayId, i)).filter(has).length;
  const lod = Math.min(levelsOfDayClaimed(keys, dayId), TARIFF.levelOfDayPerDay);
  const weekPaid = has(recordWeekKey(computeWeekId(dayId)));

  const ceiling =
    checkin.today
    + MISSIONS_PER_DAY * TARIFF.mission
    + TARIFF.daily
    + TARIFF.levelOfDayPerDay * TARIFF.levelOfDay
    // Неделя рекордов входит в потолок того дня, когда её ещё можно взять.
    + (weekPaid ? 0 : TARIFF.recordWeek);
  const earned =
    (checkin.claimedToday ? checkin.today : 0)
    + missionsDone * TARIFF.mission
    + (has(wordKey(dayId)) ? TARIFF.daily : 0)
    + lod * TARIFF.levelOfDay;
  return { ceiling, earned, remaining: Math.max(0, ceiling - earned) };
}

export interface GrantedBonus {
  key: string;
  amount: number;
}

export interface RoundBonuses {
  granted: GrantedBonus[];
  /** Сумма начисленного этой партией — её показывает анимация «+N». */
  total: number;
  /** Баланс после начисления. */
  balance: number;
}

/**
 * Бонусы за завершённую партию: первое прохождение уровня и задания дня,
 * закрывшиеся именно этой партией.
 *
 * `missionsBefore` снимается ДО записи результата (recordLevelResult /
 * recordEndlessResult) — иначе не увидеть, какие задания закрылись сейчас.
 */
export function grantRoundBonuses(input: {
  slug: string;
  n: number;
  record: RecordResult | null;
  missionsBefore: Mission[];
  dayId?: number;
}): RoundBonuses {
  const dayId = input.dayId ?? computeDayId();
  const granted: GrantedBonus[] = [];
  const tryAward = (key: string, amount: number) => {
    if (awardOnce(key, amount)) granted.push({ key, amount });
  };

  if (input.record?.unlockedNext) {
    tryAward(`level-${input.slug}-${input.n}`, TARIFF.level(input.n));
  }

  grantClosedMissions(tryAward, input.missionsBefore, dayId);
  const total = granted.reduce((sum, g) => sum + g.amount, 0);
  return { granted, total, balance: bonusBalance() };
}

/** Задания дня, закрывшиеся этой партией: сверка «до» и «после». */
function grantClosedMissions(
  tryAward: (key: string, amount: number) => void,
  missionsBefore: Mission[],
  dayId: number,
): void {
  dailyMissions(dayId).forEach((m, i) => {
    if (m.done && !missionsBefore[i]?.done) {
      tryAward(missionKey(dayId, i), TARIFF.mission);
    }
  });
}

/**
 * Бонусы аркадного забега: каждое закрытое испытание оплачивается по тарифу
 * уровня (испытание n — это уровень n), плюс задания дня. Ключи идемпотентны —
 * повторов не бывает. Вехи (T4) бонусов не дают: испытания и вехи мерили одну
 * шкалу, осталась одна — испытания; поле `milestones` принимается и игнорируется.
 */
export function grantArcadeBonuses(input: {
  slug: string;
  closed: ReadonlyArray<{ n: number }>;
  /** @deprecated вехи больше не оплачиваются — см. выше. */
  milestones?: ReadonlyArray<{ id: string; reward: number; achieved: boolean }>;
  missionsBefore: Mission[];
  dayId?: number;
}): RoundBonuses {
  const dayId = input.dayId ?? computeDayId();
  const granted: GrantedBonus[] = [];
  const tryAward = (key: string, amount: number) => {
    if (awardOnce(key, amount)) granted.push({ key, amount });
  };

  for (const ch of input.closed) {
    tryAward(`level-${input.slug}-${ch.n}`, TARIFF.level(ch.n));
  }
  grantClosedMissions(tryAward, input.missionsBefore, dayId);

  const total = granted.reduce((sum, g) => sum + g.amount, 0);
  return { granted, total, balance: bonusBalance() };
}
