import type {
  ApiClient, SubmitScorePayload, SubmitScoreResult, LeaderboardEntry,
  RoundEvent, GameResult, EventsAccepted, AwardResult,
} from '@gamewingo/game-bridge';

/**
 * Демо-бэкенд для автономного запуска (без реального WinGo/сервера).
 * Хранит лучший счёт в localStorage. В приложении заменяется реальным API через INIT.
 */

const KEY_SCORE = 'pairs:demo:lastScore';

function get(key: string, def: number): number {
  try { const v = localStorage.getItem(key); return v === null ? def : Number(v); } catch { return def; }
}
function put(key: string, v: number): void {
  try { localStorage.setItem(key, String(v)); } catch { /* приватный режим */ }
}

export function createDemoApi(): ApiClient {
  return {
    async submitScore(p: SubmitScorePayload): Promise<SubmitScoreResult> {
      put(KEY_SCORE, Math.max(get(KEY_SCORE, 0), p.score));
      return { accepted: true, pointsAwarded: Math.round(p.score / 100) };
    },
    async submitEvents(_events: RoundEvent[]): Promise<EventsAccepted> {
      // Демо: событийный скоринг есть только на сервере, локально пакет глотается.
      return { xp: 0 };
    },
    async submitResult(_result: GameResult): Promise<AwardResult> {
      return { xp: 0, stars: 0, unlockedAchievements: [], balance: 0 };
    },
    async leaderboard(_gameId: string, limit = 10): Promise<LeaderboardEntry[]> {
      const myScore = get(KEY_SCORE, 0);
      const fake = [
        { name: 'Sardor', score: 4980 }, { name: 'Malika', score: 4610 },
        { name: 'Jasur', score: 4270 }, { name: 'Nigora', score: 3900 },
        { name: 'Bekzod', score: 3320 }, { name: 'Dilnoza', score: 2760 },
      ];
      return [...fake, { name: 'Siz', score: myScore, me: true }]
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((e, i) => ({
          rank: i + 1, name: e.name, score: e.score,
          isCurrentUser: 'me' in e && !!e.me,
        }));
    },
  };
}

export const DEMO_API_BASE = 'demo://local';
