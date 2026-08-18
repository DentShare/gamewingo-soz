import { describe, expect, it } from 'vitest';
import { GAME_IDS } from '@gamewingo/game-bridge';
import { GAME_CONFIGS } from './configs.js';
import { CATALOG_ECONOMY } from './catalog.js';
import { GAME_ACHIEVEMENTS, achievementToasts, achievementsForGame } from './registry.js';
import { TARIFF } from '../bonus.js';

describe('GAME_CONFIGS: целостность', () => {
  it('покрывает все игры каталога, ключ совпадает с gameId', () => {
    expect(Object.keys(GAME_CONFIGS).sort()).toEqual([...GAME_IDS].sort());
    for (const [key, cfg] of Object.entries(GAME_CONFIGS)) expect(cfg.gameId).toBe(key);
  });

  it('события скоринга уникальны внутри игры, базы неотрицательны', () => {
    for (const cfg of Object.values(GAME_CONFIGS)) {
      const names = cfg.scoring.map((r) => r.event);
      expect(new Set(names).size).toBe(names.length);
      for (const r of cfg.scoring) expect(r.base).toBeGreaterThanOrEqual(0);
    }
  });

  it('правило с базой 0 обязано иметь perItemKey — иначе оно всегда даёт ноль', () => {
    for (const cfg of Object.values(GAME_CONFIGS)) {
      for (const r of cfg.scoring) {
        if (r.base === 0) expect(r.perItemKey, `${cfg.gameId}/${r.event}`).toBeDefined();
      }
    }
  });

  it('модификаторы согласованы со своим типом', () => {
    for (const cfg of Object.values(GAME_CONFIGS)) {
      for (const r of cfg.scoring) {
        for (const m of r.modifiers ?? []) {
          if (m.type === 'linear') expect(m.factor, `${cfg.gameId}/${r.event}`).toBeDefined();
          if (m.type === 'threshold') {
            expect(m.threshold, `${cfg.gameId}/${r.event}`).toBeDefined();
            expect(m.multiplier, `${cfg.gameId}/${r.event}`).toBeDefined();
          }
        }
      }
    }
  });

  it('метрика звёзд совпадает с тем, что игра передаёт в starsFor на экране итога', () => {
    // Сверено с games/<slug>/src/game/scenes/GameOver.ts — источник каждой метрики.
    const expected: Record<string, string> = {
      soz: 'guessesUsed', pairs: 'moves', fifteen: 'moves', '2048': 'score',
      'sudoku-kids': 'timeSec', stack: 'score', flyer: 'score', targets: 'score',
      snake: 'score', sorting: 'mistakes', counting: 'mistakes',
      quiz: 'mistakes', jigsaw: 'wrongDrops', sums: 'extraMoves',
    };
    for (const cfg of Object.values(GAME_CONFIGS)) {
      expect(cfg.starMetric, cfg.gameId).toBe(expected[cfg.gameId]);
    }
  });

  it('запасные пороги звёзд монотонны: третья звезда строже первой', () => {
    for (const cfg of Object.values(GAME_CONFIGS)) {
      const rules = [...cfg.starsFallback].sort((a, b) => a.stars - b.stars);
      expect(rules.map((r) => r.stars)).toEqual([1, 2, 3]);
      const [s1, , s3] = rules;
      if (s1.op === 'gte') expect(s3.value).toBeGreaterThan(s1.value);
      else expect(s3.value).toBeLessThan(s1.value);
    }
  });

  it('id заданий и достижений уникальны по всему каталогу', () => {
    const ids = Object.values(GAME_CONFIGS).flatMap((cfg) => [
      ...cfg.dailyQuests.map((q) => q.id),
      ...cfg.achievements.map((a) => a.id),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('каждая строка локализована на оба языка', () => {
    for (const cfg of Object.values(GAME_CONFIGS)) {
      for (const item of [...cfg.dailyQuests, ...cfg.achievements]) {
        expect(item.title.ru.length, item.id).toBeGreaterThan(0);
        expect(item.title.uz.length, item.id).toBeGreaterThan(0);
      }
    }
  });

  it('лимиты антифрода положительные', () => {
    for (const cfg of Object.values(GAME_CONFIGS)) {
      expect(cfg.antiFraud.maxScorePerSession).toBeGreaterThan(0);
      expect(cfg.antiFraud.maxSessionMs).toBeGreaterThan(0);
      expect(cfg.antiFraud.maxEventsPerMinute).toBeGreaterThan(0);
    }
  });

  it('конфиги сериализуемы в JSON без потерь — админка хранит их как jsonb', () => {
    for (const cfg of Object.values(GAME_CONFIGS)) {
      expect(JSON.parse(JSON.stringify(cfg))).toEqual(cfg);
    }
  });
});

describe('CATALOG_ECONOMY: тарифы сервера равны тарифам демо-кошелька', () => {
  it('формула уровня восстанавливается из base + step', () => {
    const { levelBase, levelStep } = CATALOG_ECONOMY.tariff;
    for (const n of [1, 5, 15]) {
      expect(levelBase + levelStep * (n - 1)).toBe(TARIFF.level(n));
    }
  });

  it('остальные тарифы совпадают с bonus.ts', () => {
    expect(CATALOG_ECONOMY.tariff.mission).toBe(TARIFF.mission);
    expect(CATALOG_ECONOMY.tariff.daily).toBe(TARIFF.daily);
    expect(CATALOG_ECONOMY.tariff.checkinBase).toBe(TARIFF.checkinBase);
    expect(CATALOG_ECONOMY.tariff.checkinCap).toBe(TARIFF.checkinCap);
  });
});

describe('Реестр пер-игровых достижений', () => {
  it('содержит все достижения всех конфигов', () => {
    const total = Object.values(GAME_CONFIGS)
      .reduce((sum, cfg) => sum + cfg.achievements.length, 0);
    expect(Object.keys(GAME_ACHIEVEMENTS)).toHaveLength(total);
  });

  it('achievementsForGame отдаёт достижения одной игры', () => {
    const soz = achievementsForGame('soz');
    expect(soz.map((a) => a.id).sort()).toEqual(['soz_erudite', 'soz_lightning']);
  });

  it('achievementToasts локализует и пропускает неизвестные id', () => {
    const toasts = achievementToasts(['soz_erudite', 'unknown_from_newer_server'], 'uz');
    expect(toasts).toEqual([{ id: 'soz_erudite', title: 'Bilimdon', reward: 200 }]);
  });
});
