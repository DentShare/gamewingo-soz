import { beforeEach, describe, expect, it } from 'vitest';
import { namePet, petState, recordPetRound } from './pet.js';
import { recordRound } from './missions.js';

const DAY = 20_900;

beforeEach(() => localStorage.clear());

describe('локальный прототип феникса', () => {
  it('даёт одну искру за игру в день и максимум три за день', () => {
    expect(recordPetRound('pairs', DAY)).toBe(true);
    expect(recordPetRound('pairs', DAY)).toBe(false);
    expect(recordPetRound('2048', DAY)).toBe(true);
    expect(recordPetRound('soz', DAY)).toBe(true);
    expect(recordPetRound('snake', DAY)).toBe(false);
    expect(petState(DAY)).toMatchObject({ total: 3, today: 3, stage: 'awakening' });
  });

  it('сохраняет общий рост при смене дня и вылупляет птенца на шестой искре', () => {
    for (const slug of ['pairs', 'soz', '2048']) recordPetRound(slug, DAY);
    expect(petState(DAY + 1)).toMatchObject({ total: 3, today: 0, stage: 'awakening' });
    for (const slug of ['pairs', 'soz', '2048']) recordPetRound(slug, DAY + 1);
    expect(petState(DAY + 1)).toMatchObject({ total: 6, today: 3, stage: 'chick', nextStageAt: null });
  });

  it('получает искру из общего завершённого итога игры', () => {
    recordRound({ slug: 'pairs', cleared: true, stars: 2, score: 40 }, DAY);
    recordRound({ slug: 'pairs', cleared: true, stars: 3, score: 50 }, DAY);
    expect(petState(DAY)).toMatchObject({ total: 1, gamesToday: ['pairs'] });
  });

  it('не записывает демо-искру при активном серверном пилоте', () => {
    const target = globalThis as typeof globalThis & { WingoPetPilot?: { enabled: boolean } };
    target.WingoPetPilot = { enabled: true };
    try {
      recordRound({ slug: 'pairs', cleared: true, stars: 2, score: 40 }, DAY);
      expect(petState(DAY).total).toBe(0);
    } finally {
      delete target.WingoPetPilot;
    }
  });

  it('запоминает последнюю искру для отклика после партии', () => {
    recordPetRound('2048', DAY, 123456);
    expect(petState(DAY).lastSpark).toEqual({ game: '2048', at: 123456 });
    recordPetRound('2048', DAY, 123999);
    expect(petState(DAY).lastSpark).toEqual({ game: '2048', at: 123456 });
  });

  it('отклоняет повреждённое локальное состояние', () => {
    localStorage.setItem('wingo:phoenix:demo:v1', JSON.stringify({ total: -500, dayId: DAY, gamesToday: ['pairs', 'pairs', 2] }));
    expect(petState(DAY)).toMatchObject({ total: 0, today: 0, stage: 'egg' });
  });

  it('разрешает имя только после вылупления', () => {
    expect(namePet('Огонёк').name).toBe('');
    for (const day of [DAY, DAY + 1]) for (const slug of ['pairs', 'soz', '2048']) recordPetRound(slug, day);
    // namePet использует текущий день; общий прогресс сохраняется при смене даты.
    expect(namePet('  Огонёк  ').name).toBe('Огонёк');
  });
});
