import { describe, expect, it } from 'vitest';
import { TouchControls, stickDirection } from './controls';

describe('touch controls', () => {
  it('has a dead zone and chooses the dominant axis', () => {
    expect(stickDirection(2, -3)).toBeNull(); expect(stickDirection(30, -10)).toBe('right');
    expect(stickDirection(-30, 5)).toBe('left'); expect(stickDirection(5, -30)).toBe('up');
    expect(stickDirection(2, 20)).toBe('down');
  });
  it('keeps two independent fingers while leaving the original zones', () => {
    const c = new TouchControls(); c.startStick(1); c.startFire(2); c.move(1, 200, 5);
    expect(c.direction).toBe('right'); expect(c.fire).toBe(2); expect(c.dx).toBeLessThanOrEqual(35);
    c.release(2); expect(c.direction).toBe('right'); expect(c.fire).toBeNull();
    c.release(1); expect(c.direction).toBeNull(); expect(c.dx).toBe(0);
  });
  it('does not let another pointer steal a control or a single finger own both', () => {
    const c = new TouchControls(); c.startStick(4); c.startStick(5); c.startFire(4);
    expect(c.stick).toBe(4); expect(c.fire).toBeNull(); c.move(5, 100, 0); expect(c.direction).toBeNull();
    c.startFire(5); c.clear(); expect(c.stick).toBeNull(); expect(c.fire).toBeNull();
  });
});
