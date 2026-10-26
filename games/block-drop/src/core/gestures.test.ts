import { describe, expect, it } from 'vitest';
import { SwipeControls } from './gestures';

describe('swipe controls', () => {
  it('follows the finger in columns and supports reversing direction without an extra move on release', () => {
    const controls = new SwipeControls(32);
    controls.start(1, 100, 200, 0);
    expect(controls.move(1, 117, 202)).toEqual([]);
    expect(controls.move(1, 118, 202)).toEqual(['right']);
    expect(controls.move(1, 182, 202)).toEqual(['right', 'right']);
    expect(controls.move(1, 149, 204)).toEqual(['left']);
    expect(controls.end(1, 149, 204, 200)).toEqual([]);
  });

  it('rotates once on a short tap, tolerates finger jitter and ignores long presses', () => {
    const controls = new SwipeControls(32);
    controls.start(1, 100, 200, 0);
    expect(controls.end(1, 106, 203, 180)).toEqual(['rotate']);
    expect(controls.end(1, 106, 203, 190)).toEqual([]);
    controls.start(1, 100, 200, 200);
    expect(controls.end(1, 100, 200, 600)).toEqual([]);
  });

  it('drops only on release after a deliberate downward swipe and rotates back on swipe up', () => {
    const controls = new SwipeControls(32);
    controls.start(1, 100, 200, 0);
    expect(controls.move(1, 102, 280)).toEqual([]);
    expect(controls.end(1, 102, 280, 180)).toEqual(['drop']);
    controls.start(1, 100, 200, 200);
    expect(controls.end(1, 102, 160, 380)).toEqual(['rotateBack']);
    controls.start(1, 100, 200, 400);
    expect(controls.end(1, 102, 240, 580)).toEqual([]);
  });

  it('locks the gesture axis so diagonal drift and returning to the start cannot trigger a drop or tap', () => {
    const controls = new SwipeControls(32);
    controls.start(1, 100, 200, 0);
    expect(controls.move(1, 120, 202)).toEqual(['right']);
    expect(controls.end(1, 120, 300, 200)).toEqual([]);
    controls.start(1, 100, 200, 300);
    controls.move(1, 113, 200);
    expect(controls.end(1, 100, 200, 450)).toEqual([]);
  });

  it('ignores secondary fingers and cancels an unfinished gesture on pause, touch cancel or piece lock', () => {
    const controls = new SwipeControls(32);
    controls.start(1, 100, 200, 0);
    controls.start(2, 100, 200, 10);
    expect(controls.end(2, 100, 300, 150)).toEqual([]);
    expect(controls.move(1, 80, 200)).toEqual(['left']);
    controls.cancel();
    expect(controls.end(1, 80, 300, 200)).toEqual([]);
    controls.start(3, 100, 200, 300);
    expect(controls.end(3, 100, 200, 400)).toEqual(['rotate']);
  });
});
