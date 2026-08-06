import type { StarRule } from './types.js';

/** Три звезды по метрике «больше — лучше» (очки, плитка, дистанция). */
export function starsGte(metric: string, v1: number, v2: number, v3: number): StarRule[] {
  return [
    { stars: 1, metric, op: 'gte', value: v1 },
    { stars: 2, metric, op: 'gte', value: v2 },
    { stars: 3, metric, op: 'gte', value: v3 },
  ];
}

/** Три звезды по метрике «меньше — лучше» (ходы, ошибки, секунды). */
export function starsLte(metric: string, v1: number, v2: number, v3: number): StarRule[] {
  return [
    { stars: 1, metric, op: 'lte', value: v1 },
    { stars: 2, metric, op: 'lte', value: v2 },
    { stars: 3, metric, op: 'lte', value: v3 },
  ];
}
