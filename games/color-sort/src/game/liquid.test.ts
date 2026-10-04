import { describe, expect, it } from 'vitest';
import { liquidBands, polygonArea, pouringAngle } from './liquid';

describe('liquid geometry', () => {
  it('preserves each color volume at every pouring angle', () => {
    const layers = [{ color: 1, amount: 1 }, { color: 2, amount: 0.4 }, { color: 3, amount: 2 }];
    const upright = liquidBands(layers, 0).map((band) => polygonArea(band.points));
    for (const angle of [-1.65, -0.7, 0.7, 1.65]) {
      liquidBands(layers, angle).forEach((band, index) => expect(polygonArea(band.points)).toBeCloseTo(upright[index], 2));
    }
  });

  it('keeps the free surface horizontal in screen coordinates', () => {
    for (const angle of [-1.3, 0, 1.3]) {
      const [band] = liquidBands([{ color: 1, amount: 1.6 }], angle);
      const worldYs = band.points.map((p) => p.x * Math.sin(angle) + p.y * Math.cos(angle));
      const surface = Math.min(...worldYs);
      expect(worldYs.filter((y) => Math.abs(y - surface) < 0.001)).toHaveLength(2);
    }
  });

  it('drains and fills continuously, including a partial top layer', () => {
    const unitArea = polygonArea(liquidBands([{ color: 1, amount: 1 }], 0)[0].points);
    for (const transferred of [0, 0.25, 1, 1.75, 2]) {
      const source = liquidBands([{ color: 1, amount: 4 - transferred }], pouringAngle(4 - transferred));
      const target = liquidBands([{ color: 1, amount: transferred }], 0);
      const total = [...source, ...target].reduce((sum, band) => sum + polygonArea(band.points), 0);
      expect(total).toBeCloseTo(unitArea * 4, 2);
    }
    expect(liquidBands([{ color: 1, amount: 0 }], 0)).toEqual([]);
    expect(pouringAngle(4)).toBeLessThan(pouringAngle(1));
  });
});
