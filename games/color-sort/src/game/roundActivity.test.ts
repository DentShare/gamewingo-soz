import { describe, expect, it } from 'vitest';
import { createRoundActivity } from './roundActivity';
describe('round activity', () => {
  it('keeps completed time fixed after host resume', () => {
    let now = 0; const round = createRoundActivity(() => now);
    round.begin(); now = 1500; round.complete(); now = 9000;
    round.pause('host'); round.resume('host'); round.begin();
    expect(round.elapsedMs()).toBe(1500);
  });
  it('excludes tutorial and independent overlapping pauses', () => {
    let now = 0;
    const round = createRoundActivity(() => now);
    now = 5000; expect(round.elapsedMs()).toBe(0);
    round.begin(); now += 1000;
    round.pause('sheet'); round.pause('host'); now += 9000;
    round.resume('host'); expect(round.paused).toBe(true);
    expect(round.elapsedMs()).toBe(1000);
    round.resume('sheet'); now += 500;
    expect(round.elapsedMs()).toBe(1500);
  });
  it('does not resume in a hidden tab or reset on duplicate begin', () => {
    let now = 0;
    const round = createRoundActivity(() => now);
    round.pause('hidden'); round.begin(); now = 2000;
    round.resume('sheet'); expect(round.elapsedMs()).toBe(0);
    round.resume('hidden'); now = 3000; round.begin();
    expect(round.elapsedMs()).toBe(1000);
  });
});
