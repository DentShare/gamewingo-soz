import { expect, it } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';
import { CHALLENGES } from '../core/challenges';
it('keeps RU/UZ keys, nonempty text and placeholders in sync', () => {
  expect(Object.keys(ru).sort()).toEqual(Object.keys(uz).sort());
  for (const key of Object.keys(ru) as Array<keyof typeof ru>) {
    expect(ru[key].trim()).not.toBe(''); expect(uz[key].trim()).not.toBe('');
    expect(ru[key].match(/\{\w+\}/g)?.sort()).toEqual(uz[key].match(/\{\w+\}/g)?.sort());
  }
});
it('provides 15 ordered, localized challenges for real basketball metrics', () => {
  expect(CHALLENGES).toHaveLength(15);
  CHALLENGES.forEach((c, i) => {
    expect(c.n).toBe(i + 1); expect(['baskets', 'cleanBaskets', 'bestCleanStreak']).toContain(c.metric);
    for (const loc of ['ru', 'uz'] as const) expect(t(loc, `challenge.${c.id}`, { n: c.target })).not.toContain('{');
  });
});
