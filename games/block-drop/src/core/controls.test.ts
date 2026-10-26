import { describe, expect, it } from 'vitest';
import { HeldControls, type RepeatAction } from './controls';

describe('held keyboard and touch controls', () => {
  it('moves immediately, then repeats at a fixed delay and interval', () => {
    const controls = new HeldControls();
    const actions: RepeatAction[] = [];
    const run = (action: RepeatAction) => { actions.push(action); };
    controls.press('ArrowLeft', 'left', 0, run);
    controls.press('ArrowLeft', 'left', 50, run); // native repeat is ignored
    controls.update(159, run);
    expect(actions).toEqual(['left']);
    controls.update(160, run);
    controls.update(214, run);
    expect(actions).toHaveLength(2);
    controls.update(215, run);
    expect(actions).toEqual(['left', 'left', 'left']);
    controls.release('ArrowLeft');
    controls.update(500, run);
    expect(actions).toHaveLength(3);
  });

  it('gives the newest horizontal direction priority and releases sources independently', () => {
    const controls = new HeldControls();
    const actions: RepeatAction[] = [];
    const run = (action: RepeatAction) => { actions.push(action); };
    controls.press('KeyA', 'left', 0, run);
    controls.press('pointer:1', 'right', 10, run);
    controls.update(200, run);
    expect(actions).toEqual(['left', 'right', 'right']);
    controls.release('pointer:1');
    controls.update(201, run);
    expect(actions[actions.length - 1]).toBe('left');
  });

  it('soft-drops alongside horizontal movement, clears on pause, and never catches up in bursts', () => {
    const controls = new HeldControls();
    const actions: RepeatAction[] = [];
    const run = (action: RepeatAction) => { actions.push(action); };
    controls.press('KeyS', 'down', 0, run);
    controls.press('pointer:2', 'left', 0, run);
    controls.update(45, run);
    expect(actions).toEqual(['down', 'left', 'down']);
    controls.update(10000, run);
    expect(actions.slice(-2)).toEqual(['left', 'down']);
    expect(actions).toHaveLength(5);
    controls.clear();
    controls.update(20000, run);
    expect(actions).toHaveLength(5);
  });
});
