import { UZ_DIGRAPHS, type Locale } from './locale';

/** Приводит слово к нормальной форме: нижний регистр + канонический ʻ (U+02BB); для ru ё→е. */
export function normalizeWord(word: string, locale: Locale): string {
  let w = word.toLowerCase();
  if (locale === 'uz') {
    w = w.replace(/['’ʼ`´]/g, 'ʻ'); // все варианты апострофа → U+02BB
  }
  if (locale === 'ru') {
    w = w.replace(/ё/g, 'е');
  }
  return w;
}

/** Режет слово на буквы-юниты (диграф-осознанно для uz). Нормализует вход сам. */
export function tokenizeWord(word: string, locale: Locale): string[] {
  const w = normalizeWord(word, locale);
  if (locale === 'ru') return Array.from(w);

  const units: string[] = [];
  let i = 0;
  while (i < w.length) {
    const two = w.slice(i, i + 2);
    if ((UZ_DIGRAPHS as readonly string[]).includes(two)) {
      units.push(two);
      i += 2;
    } else {
      units.push(w[i]);
      i += 1;
    }
  }
  return units;
}
