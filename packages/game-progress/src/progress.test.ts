import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearedCount, isLadderComplete, isUnlocked, loadProgress, nextLevel,
  recordLevel, saveProgress, totalStars, unlockedCount, type Progress,
} from './progress.js';

const SLUG = 'testgame';

beforeEach(() => {
  localStorage.clear();
});

describe('recordLevel', () => {
  it('пишет звёзды и рекорд с нуля', () => {
    const r = recordLevel(SLUG, 1, 2, 500);
    expect(r.improvedStars).toBe(true);
    expect(r.isRecord).toBe(true);
    expect(r.unlockedNext).toBe(true);
    expect(loadProgress(SLUG).stars[0]).toBe(2);
    expect(loadProgress(SLUG).best[0]).toBe(500);
  });

  it('не отбирает заработанное при худшем перепрохождении', () => {
    recordLevel(SLUG, 1, 3, 900);
    const r = recordLevel(SLUG, 1, 1, 100);
    expect(r.improvedStars).toBe(false);
    expect(r.isRecord).toBe(false);
    expect(loadProgress(SLUG).stars[0]).toBe(3);
    expect(loadProgress(SLUG).best[0]).toBe(900);
  });

  it('улучшает звёзды при лучшем перепрохождении, но не считает уровень новым', () => {
    recordLevel(SLUG, 1, 1, 100);
    const r = recordLevel(SLUG, 1, 3, 400);
    expect(r.improvedStars).toBe(true);
    expect(r.unlockedNext).toBe(false);
    expect(loadProgress(SLUG).stars[0]).toBe(3);
  });

  it('уровень через пропуск не оставляет дырок в массиве', () => {
    recordLevel(SLUG, 4, 2, 300);
    const p = loadProgress(SLUG);
    expect(p.stars).toEqual([0, 0, 0, 2]);
    expect(p.best).toEqual([0, 0, 0, 300]);
  });
});

describe('разблокировка', () => {
  const withStars = (stars: number[]): Progress => ({ stars, best: stars.map(() => 0) });

  it('первый уровень открыт всегда', () => {
    expect(isUnlocked(loadProgress(SLUG), 1)).toBe(true);
  });

  it('следующий открывается только после предыдущего', () => {
    const p = withStars([2, 0, 0]);
    expect(isUnlocked(p, 2)).toBe(true);
    expect(isUnlocked(p, 3)).toBe(false);
  });

  it('unlockedCount — пройденные подряд плюс один', () => {
    expect(unlockedCount(withStars([]), 12)).toBe(1);
    expect(unlockedCount(withStars([3, 2]), 12)).toBe(3);
    // Дырка в середине не открывает уровни за ней.
    expect(unlockedCount(withStars([3, 0, 3]), 12)).toBe(2);
  });

  it('unlockedCount не превышает длину лестницы', () => {
    expect(unlockedCount(withStars([1, 1, 1]), 3)).toBe(3);
  });

  it('nextLevel — первый непройденный, а в конце последний', () => {
    expect(nextLevel(withStars([3, 3]), 5)).toBe(3);
    expect(nextLevel(withStars([3, 3, 3]), 3)).toBe(3);
  });
});

describe('сводка', () => {
  it('считает звёзды и пройденные уровни', () => {
    const p: Progress = { stars: [3, 0, 2, 1], best: [] };
    expect(totalStars(p)).toBe(6);
    expect(clearedCount(p)).toBe(3);
    expect(isLadderComplete(p, 4)).toBe(false);
    expect(isLadderComplete({ stars: [1, 1, 1, 1], best: [] }, 4)).toBe(true);
  });
});

describe('устойчивость хранилища', () => {
  it('битый JSON читается как пустой прогресс', () => {
    localStorage.setItem(`${SLUG}:ladder`, '{не json');
    expect(loadProgress(SLUG)).toEqual({ stars: [], best: [] });
  });

  it('чужая форма данных не роняет чтение', () => {
    localStorage.setItem(`${SLUG}:ladder`, JSON.stringify({ stars: 'нет', best: [null, 'x', 5] }));
    expect(loadProgress(SLUG)).toEqual({ stars: [], best: [0, 0, 5] });
  });

  it('сохранённый прогресс читается обратно', () => {
    saveProgress(SLUG, { stars: [1, 2, 3], best: [10, 20, 30] });
    expect(loadProgress(SLUG)).toEqual({ stars: [1, 2, 3], best: [10, 20, 30] });
  });
});
