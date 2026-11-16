import type { ApiClient, SubmitScoreResult } from './api.js';
import type { GameBridge } from './bridge.js';
import type { GameResult } from './events.js';

/** Партий, отправленных в каждой сессии хоста (по sessionId из INIT). */
const roundsBySession = new Map<string, number>();

/**
 * ID партии: `<sessionId хоста>:<номер партии>`. Приложение выдаёт sessionId
 * один на открытие страницы игры, а антифрод сервера меряет лимит времени
 * от первого появления ID — с общим ID вторая партия после 15 минут в игре
 * отклонялась бы. Префикс сохраняет связь партии с сессией хоста.
 */
function roundSessionId(sessionId: string): string {
  const n = (roundsBySession.get(sessionId) ?? 0) + 1;
  roundsBySession.set(sessionId, n);
  return `${sessionId}:${n}`;
}

/**
 * Итог партии одним вызовом: GAME_RESULT приложению и результат в Score Engine
 * (`POST /progression/result`). Игра не считает баллы — сервер решает по режиму,
 * уровню, победе и метрикам.
 *
 * Ответ приводится к `{accepted, pointsAwarded}` — форме, которую ждут сцены
 * итога. `null` — нет API (до INIT) или запрос упал: ошибка уходит хосту GAME_ERROR.
 */
export async function reportResult(
  bridge: GameBridge,
  api: ApiClient | null,
  result: GameResult,
): Promise<SubmitScoreResult | null> {
  const round: GameResult = { ...result, sessionId: roundSessionId(result.sessionId) };
  bridge.sendResult(round);
  if (!api) return null;
  try {
    const award = await api.submitResult(round);
    return { accepted: !award.rejected, pointsAwarded: award.xp };
  } catch (err) {
    bridge.error(String(err));
    return null;
  }
}
