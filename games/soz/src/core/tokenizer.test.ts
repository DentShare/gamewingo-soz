import { describe, it, expect } from 'vitest';
import { normalizeWord, tokenizeWord } from './tokenizer';

describe('normalizeWord', () => {
  it('нижний регистр и канонизация апострофа в ʻ (U+02BB)', () => {
    expect(normalizeWord('Oʼrik', 'uz')).toBe('oʻrik');
    expect(normalizeWord("O'RIK", 'uz')).toBe('oʻrik');
    expect(normalizeWord('O’rik', 'uz')).toBe('oʻrik');
  });
  it('ru: ё сводится к е', () => {
    expect(normalizeWord('ЁЛКА', 'ru')).toBe('елка');
  });
});

describe('tokenizeWord ru', () => {
  it('посимвольно', () => {
    expect(tokenizeWord('книга', 'ru')).toEqual(['к', 'н', 'и', 'г', 'а']);
  });
});

describe('tokenizeWord uz (диграфы)', () => {
  it('sh как один юнит', () => {
    expect(tokenizeWord('shahar', 'uz')).toEqual(['sh', 'a', 'h', 'a', 'r']);
  });
  it('oʻ как один юнит', () => {
    expect(tokenizeWord('oʻrik', 'uz')).toEqual(['oʻ', 'r', 'i', 'k']);
  });
  it('ng, ch, gʻ', () => {
    expect(tokenizeWord('gʻozch', 'uz')).toEqual(['gʻ', 'o', 'z', 'ch']);
    expect(tokenizeWord('tong', 'uz')).toEqual(['t', 'o', 'ng']);
  });
  it('жадный разбор: s+h всегда sh', () => {
    expect(tokenizeWord('mshaa', 'uz')).toEqual(['m', 'sh', 'a', 'a']);
  });
});
