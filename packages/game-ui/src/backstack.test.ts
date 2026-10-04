import { describe, expect, it, vi } from 'vitest';
import { guardBrowserBack } from './backstack.js';
describe('browser back guard', () => {
  it('reuses the boundary across restarts and removes old handlers', () => {
    const first = vi.fn(), second = vi.fn();
    const off = guardBrowserBack(first);
    const length = history.length;
    off();
    const dispose = guardBrowserBack(second);
    expect(history.length).toBe(length);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(first).not.toHaveBeenCalled(); expect(second).toHaveBeenCalledOnce();
    dispose(); window.dispatchEvent(new PopStateEvent('popstate'));
    expect(second).toHaveBeenCalledOnce();
  });
  it('arms only the game and lets the menu exit without another boundary', () => {
    const back = vi.fn();
    const off = guardBrowserBack(back, false);
    const length = history.length;
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(back).toHaveBeenCalledOnce(); expect(history.length).toBe(length);
    off();
  });
});
