export type Locale = 'ru' | 'uz';

/** Диграфы узбекской латиницы — каждый считается одной «буквой-юнитом». */
export const UZ_DIGRAPHS = ['oʻ', 'gʻ', 'sh', 'ch', 'ng'] as const;

/** Длина слова в юнитах. */
export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;
