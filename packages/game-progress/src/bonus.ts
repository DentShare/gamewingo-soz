import { readJson, writeJson } from './storage.js';
import { computeDayId } from './day.js';
import { dailyMissions, type Mission } from './missions.js';
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
};

/** Разовая выдача по ключу. true — начислено, false — уже выдавалось. */
export function awardOnce(key: string, amount: number): boolean {
  const w = load();
  if (w.keys.includes(key)) return false;
  w.keys.push(key);
  if (w.keys.length > MAX_KEYS) w.keys.splice(0, w.keys.length - MAX_KEYS);
  w.balance += Math.max(0, Math.round(amount));
  save(w);
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
  return { amount, run };
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
      tryAward(`mission-${dayId}-${i}`, TARIFF.mission);
    }
  });
}

/**
 * Бонусы аркадного забега: каждое закрытое испытание оплачивается по тарифу
 * уровня (испытание n — это уровень n), достигнутые вехи — по своей цене,
 * плюс задания дня. Ключи идемпотентны — повторов не бывает.
 */
export function grantArcadeBonuses(input: {
  slug: string;
  closed: ReadonlyArray<{ n: number }>;
  milestones: ReadonlyArray<{ id: string; reward: number; achieved: boolean }>;
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
  for (const m of input.milestones) {
    if (m.achieved) tryAward(`milestone-${input.slug}-${m.id}`, m.reward);
  }
  grantClosedMissions(tryAward, input.missionsBefore, dayId);

  const total = granted.reduce((sum, g) => sum + g.amount, 0);
  return { granted, total, balance: bonusBalance() };
}
