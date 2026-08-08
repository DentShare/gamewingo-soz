import { SPACE } from './space';
import { ANIMALS } from './animals';
import { UZBEKISTAN } from './uzbekistan';
import { SCIENCE } from './science';
import { BODY } from './body';
import { MONEY } from './money';
import { TOPICS, type Question, type TopicId } from './types';

export * from './types';

/** Банк вопросов по темам. Порядок тем задан в TOPICS. */
export const BY_TOPIC: Record<TopicId, readonly Question[]> = {
  space: SPACE,
  animals: ANIMALS,
  uzbekistan: UZBEKISTAN,
  science: SCIENCE,
  body: BODY,
  money: MONEY,
};

/** Все вопросы каталога одним списком. */
export const ALL_QUESTIONS: readonly Question[] = TOPICS.flatMap((t) => BY_TOPIC[t]);

export function questionsOf(topic: TopicId): readonly Question[] {
  return BY_TOPIC[topic];
}
