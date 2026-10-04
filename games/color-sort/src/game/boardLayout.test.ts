import { describe, expect, it } from 'vitest';
import { tubePositions } from './boardLayout';

describe('color-sort mobile board', () => {
  it('fits 3–12 flasks without overlapping touch areas or controls', () => {
    for (let count = 3; count <= 12; count++) {
      const positions = tubePositions(count);
      expect(positions).toHaveLength(count);
      for (const point of positions) {
        expect(point.x - 39).toBeGreaterThanOrEqual(16);
        expect(point.x + 39).toBeLessThanOrEqual(384);
        expect(point.y - 71).toBeGreaterThanOrEqual(112);
        expect(point.y + 71).toBeLessThanOrEqual(582);
      }
      for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
        const a = positions[i], b = positions[j];
        expect(Math.abs(a.x - b.x) >= 78 || Math.abs(a.y - b.y) >= 154).toBe(true);
      }
    }
  });
});
