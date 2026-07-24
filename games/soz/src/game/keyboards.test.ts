import { describe, it, expect } from 'vitest';
import { keyboardFor, ENTER, BACKSPACE, UZ_DIGRAPH_KEYS } from './keyboards';

describe('keyboards', () => {
  it('ru: три ряда, есть ENTER и BACKSPACE в последнем', () => {
    const kb = keyboardFor('ru');
    expect(kb.length).toBe(3);
    expect(kb[2]).toContain(ENTER);
    expect(kb[2]).toContain(BACKSPACE);
  });
  it('uz: содержит ряд диграфов', () => {
    const kb = keyboardFor('uz');
    const flat = kb.flat();
    for (const d of ['oʻ', 'gʻ', 'sh', 'ch', 'ng']) expect(flat).toContain(d);
  });
  it('все диграф-клавиши помечены', () => {
    expect(UZ_DIGRAPH_KEYS.has('sh')).toBe(true);
    expect(UZ_DIGRAPH_KEYS.has('a')).toBe(false);
  });
});
