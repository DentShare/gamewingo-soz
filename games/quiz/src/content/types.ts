/** Строка на двух языках каталога. Третьего языка в контенте нет — см. CLAUDE.md. */
export interface Localized {
  ru: string;
  uz: string;
}

/** Тематики банка фактов. «Деньги» — финансовая грамотность, уместная для финтеха. */
export type TopicId = 'space' | 'animals' | 'uzbekistan' | 'science' | 'body' | 'money';

export const TOPICS: readonly TopicId[] = [
  'space', 'animals', 'uzbekistan', 'science', 'body', 'money',
];

export interface Question {
  /**
   * Устойчивый идентификатор. Порядок вопросов в файле менять можно,
   * id — нельзя: по нему считается, какие вопросы игрок уже видел.
   */
  id: string;
  topic: TopicId;
  q: Localized;
  /** Варианты ответа: минимум три, первый — всегда верный (перемешиваются в партии). */
  options: Localized[];
  /** Интересный факт, который показывается после ответа. Ради него игра и существует. */
  fact: Localized;
}

/** Хелпер: делает вопрос, где верный ответ идёт первым в списке. */
export function q(
  id: string,
  topic: TopicId,
  question: Localized,
  options: Localized[],
  fact: Localized,
): Question {
  return { id, topic, q: question, options, fact };
}
