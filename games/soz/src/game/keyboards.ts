import type { Locale } from '../core/locale';

export const ENTER = 'ENTER';
export const BACKSPACE = 'BACKSPACE';

/** Клавиша: буква-юнит, либо спецклавиша ENTER/BACKSPACE. */
export type Key = string;

export const KEYBOARD_RU: Key[][] = [
  ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х', 'ъ'],
  ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э'],
  [ENTER, 'я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', BACKSPACE],
];

export const KEYBOARD_UZ: Key[][] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['oʻ', 'gʻ', 'sh', 'ch', 'ng'],
  [ENTER, 'z', 'x', 'c', 'v', 'b', 'n', 'm', BACKSPACE],
];

/** Диграф-клавиши (для визуального выделения). */
export const UZ_DIGRAPH_KEYS = new Set(['oʻ', 'gʻ', 'sh', 'ch', 'ng']);

export function keyboardFor(locale: Locale): Key[][] {
  return locale === 'uz' ? KEYBOARD_UZ : KEYBOARD_RU;
}
