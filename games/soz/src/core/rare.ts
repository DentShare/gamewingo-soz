import { tokenizeWord } from './tokenizer';
import type { Locale } from './locale';

/**
 * Редкие слова — рычаг сложности лестницы (`rare` в `levels.ts`): загадка из
 * поднабора ответов с редкими буквами. Такие слова дольше «нащупываются»:
 * частые буквы первых ходов (о, а, е, р / a, i, o) их не открывают.
 *
 * Эвристика, пока у контента нет отдельного списка `answers.<locale>.hard.json`
 * (когда он появится, он заменит её — игра возьмёт поднабор из файла):
 * частота буквы-юнита считается по всему словарю (ответы + допустимые), редкость
 * слова — средняя «редкость» его различных букв, −log(доля буквы). Берём самую
 * редкую треть ответов. Всё детерминировано: равные оценки упорядочены по слову.
 */
export const RARE_SHARE = 1 / 3;
/** Меньше этого поднабор не бывает — иначе тренировка крутит три слова по кругу. */
export const RARE_MIN = 8;

export function rareAnswers(answers: readonly string[], corpus: readonly string[], locale: Locale): string[] {
  const freq = new Map<string, number>();
  let total = 0;
  for (const w of new Set([...answers, ...corpus])) {
    for (const u of tokenizeWord(w, locale)) {
      freq.set(u, (freq.get(u) ?? 0) + 1);
      total += 1;
    }
  }
  const rarity = (w: string) => {
    const units = [...new Set(tokenizeWord(w, locale))];
    if (!units.length || !total) return 0;
    return units.reduce((sum, u) => sum - Math.log((freq.get(u) ?? 1) / total), 0) / units.length;
  };
  const scored = answers.map((w) => ({ w, r: rarity(w) }));
  scored.sort((a, b) => b.r - a.r || (a.w < b.w ? -1 : a.w > b.w ? 1 : 0));
  const count = Math.min(answers.length, Math.max(RARE_MIN, Math.round(answers.length * RARE_SHARE)));
  return scored.slice(0, count).map((s) => s.w);
}
