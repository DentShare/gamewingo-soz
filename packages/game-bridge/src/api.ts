/**
 * Тонкий клиент к бэкенду (FastAPI + Supabase).
 * ВАЖНО: игра НИКОГДА не начисляет баллы сама — только отправляет результат.
 * Валидация, антифрод и начисление — на сервере.
 */

import type { GameResult, RoundEvent } from './events.js';

export interface ApiConfig {
  baseUrl: string;
  authToken: string;
}

export interface SubmitScorePayload {
  sessionId: string;
  gameId: string;
  score: number;
  durationMs: number;
  /** Необязательные метрики для антифрода (кол-во действий, seed и т.п.). */
  meta?: Record<string, unknown>;
}

export interface SubmitScoreResult {
  accepted: boolean;
  pointsAwarded?: number;
  reason?: string;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  isCurrentUser: boolean;
}

/** Ответ Score Engine на пакет сырых событий. */
export interface EventsAccepted {
  xp: number;
  balance?: number;
  /** Пакет отклонён антифродом (лимит частоты/времени сессии). */
  rejected?: boolean;
}

/** Ответ Score Engine на финальный результат партии. */
export interface AwardResult {
  xp: number;
  stars: number;
  unlockedAchievements: string[];
  balance: number;
}

export function createApiClient(config: ApiConfig) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.authToken}`,
  };

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${config.baseUrl}${path}`, { ...init, headers });
    if (!res.ok) {
      throw new Error(`API ${path} → ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  return {
    /** Отправить результат партии на серверную валидацию. */
    submitScore(payload: SubmitScorePayload): Promise<SubmitScoreResult> {
      return request<SubmitScoreResult>('/games/score', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    /** Получить лидерборд игры. */
    leaderboard(gameId: string, limit = 10): Promise<LeaderboardEntry[]> {
      return request<LeaderboardEntry[]>(
        `/games/${encodeURIComponent(gameId)}/leaderboard?limit=${limit}`,
      );
    },
    /** Отправить пакет сырых событий в Score Engine. */
    submitEvents(events: RoundEvent[]): Promise<EventsAccepted> {
      return request<EventsAccepted>('/progression/events', {
        method: 'POST',
        body: JSON.stringify(events),
      });
    },
    /** Отправить финальный результат партии в Score Engine. */
    submitResult(result: GameResult): Promise<AwardResult> {
      return request<AwardResult>('/progression/result', {
        method: 'POST',
        body: JSON.stringify(result),
      });
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
