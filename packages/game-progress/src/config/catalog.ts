import { TARIFF } from '../bonus.js';
import { MISSION_POOL, MISSIONS_PER_DAY } from '../missions.js';
import { ACHIEVEMENTS, CATALOG_SIZE } from '../achievements.js';

/**
 * Экономика каталога в сериализуемом виде — для выгрузки на сервер.
 *
 * Собирается из живых констант клиента (bonus.ts, missions.ts, achievements.ts),
 * а не переписывается руками: бэкенд обязан начислять по тем же тарифам,
 * которые игрок уже видит в демо-кошельке, иначе баланс «прыгнет» при
 * подключении сервера. Формула уровня хранится данными (base + step × (n − 1)) —
 * функции в JSON не выгружаются.
 */
export const CATALOG_ECONOMY = {
  version: 1,
  tariff: {
    mission: TARIFF.mission,
    daily: TARIFF.daily,
    checkinBase: TARIFF.checkinBase,
    checkinCap: TARIFF.checkinCap,
    /** Первое прохождение уровня n: levelBase + levelStep × (n − 1). */
    levelBase: TARIFF.level(1),
    levelStep: TARIFF.level(2) - TARIFF.level(1),
  },
  missions: {
    perDay: MISSIONS_PER_DAY,
    pool: MISSION_POOL,
  },
  achievements: ACHIEVEMENTS,
  catalogSize: CATALOG_SIZE,
} as const;
