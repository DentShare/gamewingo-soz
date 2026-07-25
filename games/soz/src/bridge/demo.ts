import type {
  ApiClient, SubmitScorePayload, SubmitScoreResult, LeaderboardEntry,
} from '@gamewingo/game-bridge';

/**
 * Демо-бэкенд для автономного запуска (без реального WinGo/сервера).
 * Считает баллы лояльности, стрик и лидерборд в localStorage — чтобы показать
 * полный цикл. В приложении это заменяется реальным сервером через INIT.
 */

const KEY_POINTS = 'soz:demo:points';
const KEY_STREAK = 'soz:demo:streak';
const KEY_LASTDAY = 'soz:demo:lastDay';
const KEY_SCORE = 'soz:demo:lastScore';

function get(key: string, def: number): number {
  try { const v = localStorage.getItem(key); return v === null ? def : Number(v); } catch { return def; }
}
function put(key: string, v: number): void {
  try { localStorage.setItem(key, String(v)); } catch { /* приватный режим */ }
}

/** Баллы лояльности за решённое слово дня: база + бонус за стрик. */
export function rewardPoints(streak: number): number {
  return 50 + Math.min(Math.max(streak - 1, 0), 7) * 10;
}

/** Обновляет стрик по dayId, возвращает новый стрик. */
function bumpStreak(dayId: number): number {
  const last = get(KEY_LASTDAY, -999);
  let streak = get(KEY_STREAK, 0);
  if (last === dayId) return streak; // уже засчитан сегодня
  streak = last === dayId - 1 ? streak + 1 : 1;
  put(KEY_STREAK, streak);
  put(KEY_LASTDAY, dayId);
  return streak;
}

export function currentStreak(): number {
  return get(KEY_STREAK, 0);
}

/** Демо-API: submitScore/leaderboard как у реального клиента. */
export function createDemoApi(): ApiClient {
  return {
    async submitScore(p: SubmitScorePayload): Promise<SubmitScoreResult> {
      const meta = (p.meta ?? {}) as { solved?: boolean; dayId?: number };
      if (!meta.solved) return { accepted: true, pointsAwarded: 0 };
      const streak = typeof meta.dayId === 'number' ? bumpStreak(meta.dayId) : currentStreak();
      put(KEY_SCORE, Math.max(get(KEY_SCORE, 0), p.score));
      return { accepted: true, pointsAwarded: rewardPoints(streak) };
    },
    async leaderboard(_gameId: string, limit = 10): Promise<LeaderboardEntry[]> {
      const myScore = get(KEY_SCORE, 0);
      const fake = [
        { name: 'Sardor', score: 8720 }, { name: 'Malika', score: 8310 },
        { name: 'Jasur', score: 7950 }, { name: 'Nigora', score: 7400 },
        { name: 'Bekzod', score: 6980 }, { name: 'Dilnoza', score: 6410 },
      ];
      const rows = [...fake, { name: 'Siz', score: myScore, me: true }]
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((e, i) => ({
          rank: i + 1, name: e.name, score: e.score,
          isCurrentUser: 'me' in e && !!e.me,
        }));
      return rows;
    },
  };
}

/**
 * «Приложение» демо-режима: слушает REWARD_CLAIM от игры и отвечает REWARD_RESULT,
 * начисляя баллы. Возвращает функцию отписки.
 */
export function installDemoApp(): () => void {
  const onMsg = (ev: MessageEvent) => {
    const d = ev.data as { type?: string; rewardId?: string } | undefined;
    if (!d || d.type !== 'REWARD_CLAIM') return;
    const points = rewardPoints(currentStreak());
    put(KEY_POINTS, get(KEY_POINTS, 0) + points);
    window.postMessage({ type: 'REWARD_RESULT', rewardId: d.rewardId, granted: true, points }, '*');
  };
  window.addEventListener('message', onMsg);
  return () => window.removeEventListener('message', onMsg);
}

export const DEMO_API_BASE = 'demo://local';
