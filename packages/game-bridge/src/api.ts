/**
 * Тонкий клиент к бэкенду (FastAPI + Supabase).
 * ВАЖНО: игра НИКОГДА не начисляет баллы сама — только отправляет результат.
 * Валидация, антифрод и начисление — на сервере.
 */

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
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
