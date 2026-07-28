import { describe, it, expect } from 'vitest';
import { createRoundTimer } from './roundTimer';

describe('createRoundTimer', () => {
  it('исключает паузу из elapsedMs', () => {
    let t = 0;
    const timer = createRoundTimer(() => t);
    timer.start();          // t=0
    t = 1000;               // +1000мс активно
    timer.pause();          // зафиксировали 1000
    t = 5000;               // время идёт на паузе — не считается
    timer.resume();         // t=5000
    t = 5500;               // +500мс активно
    expect(timer.elapsedMs()).toBe(1500);
  });
  it('без пауз просто разница', () => {
    let t = 100;
    const timer = createRoundTimer(() => t);
    timer.start();
    t = 100 + 3200;
    expect(timer.elapsedMs()).toBe(3200);
  });
});
