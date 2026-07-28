import type {
  ApiClient, SubmitScorePayload, SubmitScoreResult, LeaderboardEntry,
} from '@gamewingo/game-bridge';

/**
 * Демо-бэкенд для автономного запуска (без реального WinGo/сервера).
 * Хранит лучший счёт в localStorage. В приложении заменяется реальным API через INIT.
 */

const KEY_SCORE = 'counting:demo:lastScore';

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
    async leaderboard(_gameId: string, limit = 10): Promise<LeaderboardEntry[]> {
      const myScore = get(KEY_SCORE, 0);
      const fake = [
        { name: 'Sardor', score: 1300 }, { name: 'Malika', score: 1200 },
        { name: 'Jasur', score: 1100 }, { name: 'Nigora', score: 1000 },
        { name: 'Bekzod', score: 900 }, { name: 'Dilnoza', score: 800 },
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
