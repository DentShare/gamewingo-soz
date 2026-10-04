import { describe, expect, it } from 'vitest';
import manifest from '../../../manifest.json';
import hub from '../../../../hub/index.html?raw';
import icon from '../../../../hub/icons/color-sort.svg?raw';
import build from '../../../../scripts/build-catalog.mjs?raw';
import workspace from '../../../../package.json';
describe('catalog entry', () => {
  it('has a visible hub card, shared icon, manifest and catalog build entry', () => {
    const entry = manifest.games.find((game: { gameId: string }) => game.gameId === 'color-sort');
    expect(entry?.locales).toEqual(['ru', 'uz']);
    expect(entry?.leaderboard).toBe(false);
    expect(hub).toContain("id: 'color-sort'");
    expect(hub).toContain("kind: 'ladder'");
    expect(icon).toContain('<svg');
    expect(build).toContain("'color-sort'");
    expect(workspace.scripts['build:games']).toContain('@gamewingo/color-sort');
  });
});
