import { describe, it, expect } from 'vitest';
import { buildShareText } from './share';

describe('buildShareText', () => {
  it('маппит статусы в 🟩🟨⬛ и даёт строку на каждый ряд, без слова Wordle', () => {
    const rows = [
      { units: ['к', 'н', 'и', 'г', 'а'], statuses: ['correct', 'absent', 'present', 'correct', 'absent'] as const },
    ];
    const txt = buildShareText(rows as any, { solved: true, guessesUsed: 1, dayId: 20000, title: '5 harf' });
    expect(txt).toContain('🟩⬛🟨🟩⬛');
    expect(txt.toLowerCase()).not.toContain('wordle');
    expect(txt.split('\n').filter((l) => /[🟩🟨⬛]/.test(l)).length).toBe(1);
  });
});
