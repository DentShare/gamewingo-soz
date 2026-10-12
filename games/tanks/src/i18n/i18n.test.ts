import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';
import { CHALLENGES } from '../core/challenges';

describe('localization and challenges', () => {
  it('has equal nonempty RU/UZ keys and placeholders', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(uz).sort());
    for (const key of Object.keys(ru) as Array<keyof typeof ru>) {
      expect(ru[key].trim()).not.toBe(''); expect(uz[key].trim()).not.toBe('');
      expect(uz[key].match(/\{\w+\}/g)?.sort()).toEqual(ru[key].match(/\{\w+\}/g)?.sort());
    }
  });
  it('has 15 ordered challenges with localized labels', () => {
    expect(CHALLENGES).toHaveLength(15);
    for (const [i, c] of CHALLENGES.entries()) {
      expect(c.n).toBe(i + 1); expect(c.target).toBeGreaterThan(0);
      for (const loc of ['ru', 'uz'] as const) expect(t(loc, `challenge.${c.id}`, { n: c.target })).not.toContain('{n}');
    }
  });
});
