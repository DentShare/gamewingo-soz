import { computeDayId } from './day.js';
import { readJson, writeJson } from './storage.js';

/** Локальный прототип феникса. Не использовать как источник серверных наград. */
const KEY = 'wingo:phoenix:demo:v1';
export const PET_SPARKS_PER_DAY = 3;

export type PetStage = 'egg' | 'awakening' | 'chick';

interface StoredPet {
  total: number;
  dayId: number;
  gamesToday: string[];
  name: string;
  lastSpark: { game: string; at: number } | null;
}

export interface PetState extends StoredPet {
  stage: PetStage;
  today: number;
  nextStageAt: number | null;
}

function safeTotal(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function readPet(dayId: number): StoredPet {
  const raw = readJson<Partial<StoredPet>>(KEY);
  const total = safeTotal(raw?.total);
  const sameDay = raw?.dayId === dayId;
  const gamesToday = sameDay && Array.isArray(raw.gamesToday)
    ? [...new Set(raw.gamesToday.filter((slug): slug is string => typeof slug === 'string' && slug.length > 0))].slice(0, Math.min(total, PET_SPARKS_PER_DAY))
    : [];
  return {
    total,
    dayId,
    gamesToday,
    name: typeof raw?.name === 'string' ? raw.name.slice(0, 20) : '',
    lastSpark: raw?.lastSpark && typeof raw.lastSpark.game === 'string'
      && typeof raw.lastSpark.at === 'number' && Number.isFinite(raw.lastSpark.at)
      ? { game: raw.lastSpark.game, at: raw.lastSpark.at } : null,
  };
}

export function petState(dayId: number = computeDayId()): PetState {
  const state = readPet(dayId);
  const stage: PetStage = state.total < 3 ? 'egg' : state.total < 6 ? 'awakening' : 'chick';
  return {
    ...state,
    stage,
    today: state.gamesToday.length,
    nextStageAt: state.total < 3 ? 3 : state.total < 6 ? 6 : null,
  };
}

/** Вызывается только при записи настоящего экрана итога; повтор той же игры за день не даёт искру. */
export function recordPetRound(slug: string, dayId: number = computeDayId(), nowMs: number = Date.now()): boolean {
  if (!slug || typeof slug !== 'string') return false;
  const state = readPet(dayId);
  if (state.gamesToday.includes(slug) || state.gamesToday.length >= PET_SPARKS_PER_DAY) return false;
  state.gamesToday.push(slug);
  state.total += 1;
  state.lastSpark = { game: slug, at: nowMs };
  writeJson(KEY, state);
  return true;
}

/** Имя хранится только на этом устройстве; в разметку выводится через textContent. */
export function namePet(name: string): PetState {
  const state = readPet(computeDayId());
  if (state.total < 6) return petState(state.dayId);
  state.name = name.trim().replace(/\s+/g, ' ').slice(0, 20);
  writeJson(KEY, state);
  return petState(state.dayId);
}
