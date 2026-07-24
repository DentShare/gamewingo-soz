import { describe, it, expect } from 'vitest';
import { loadDictionary } from './dictionary';
import { tokenizeWord } from './tokenizer';
import { WORD_LENGTH, type Locale } from './locale';
import ansRu from '../data/answers.ru.json';
import alwRu from '../data/allowed.ru.json';
import ansUz from '../data/answers.uz.json';
import alwUz from '../data/allowed.uz.json';

const sets: Record<Locale, { answers: string[]; allowed: string[] }> = {
  ru: { answers: ansRu, allowed: alwRu },
  uz: { answers: ansUz, allowed: alwUz },
};

describe.each(['ru', 'uz'] as Locale[])('словарь %s', (loc) => {
  it('каждое слово ответов — ровно 5 юнитов', () => {
    for (const w of sets[loc].answers) {
      expect(tokenizeWord(w, loc).length, w).toBe(WORD_LENGTH);
    }
  });
  it('каждое слово догадок — ровно 5 юнитов', () => {
    for (const w of sets[loc].allowed) {
      expect(tokenizeWord(w, loc).length, w).toBe(WORD_LENGTH);
    }
  });
  it('answers и allowed дизъюнктны', () => {
    const a = new Set(sets[loc].answers);
    for (const w of sets[loc].allowed) expect(a.has(w), w).toBe(false);
  });
  it('нет дублей в answers', () => {
    expect(new Set(sets[loc].answers).size).toBe(sets[loc].answers.length);
  });
});

describe('loadDictionary', () => {
  it('has() = объединение answers ∪ allowed', () => {
    const d = loadDictionary('ru', ansRu, alwRu);
    expect(d.has(ansRu[0])).toBe(true);
    expect(d.has('щщщщщ')).toBe(false);
  });
});
