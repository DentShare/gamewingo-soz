import { normalizeWord, tokenizeWord } from './tokenizer';
import { WORD_LENGTH, type Locale } from './locale';

export interface Dictionary {
  has(word: string): boolean;
  answers: string[];
}

export function loadDictionary(locale: Locale, answers: string[], allowed: string[]): Dictionary {
  const union = new Set<string>([...answers, ...allowed].map((w) => normalizeWord(w, locale)));
  return {
    answers,
    has(word: string) {
      const w = normalizeWord(word, locale);
      return tokenizeWord(w, locale).length === WORD_LENGTH && union.has(w);
    },
  };
}
