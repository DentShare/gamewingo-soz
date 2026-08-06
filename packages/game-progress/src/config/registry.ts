import type { GameId } from '@gamewingo/game-bridge';
import { GAME_CONFIGS } from './configs.js';
import type { GameAchievementDef, LocalizedText } from './types.js';

/**
 * Плоский реестр пер-игровых достижений: сервер присылает только id
 * (PROGRESS_RESULT.achievements), а заголовок и награду для тоста
 * игра и хаб находят здесь.
 */
export const GAME_ACHIEVEMENTS: Readonly<Record<string, GameAchievementDef & { game: GameId }>> =
  Object.values(GAME_CONFIGS).reduce<Record<string, GameAchievementDef & { game: GameId }>>(
    (acc, cfg) => {
      for (const a of cfg.achievements) acc[a.id] = { ...a, game: cfg.gameId };
      return acc;
    },
    {},
  );

export function achievementsForGame(game: GameId): Array<GameAchievementDef & { game: GameId }> {
  return Object.values(GAME_ACHIEVEMENTS).filter((a) => a.game === game);
}

export interface AchievementToast {
  id: string;
  title: string;
  reward: number;
}

/**
 * Готовые данные тостов по списку id от сервера. Неизвестные id молча
 * пропускаются: сервер может быть новее клиента, падать из-за этого нельзя.
 */
export function achievementToasts(ids: string[], locale: keyof LocalizedText): AchievementToast[] {
  return ids.flatMap((id) => {
    const def = GAME_ACHIEVEMENTS[id];
    return def ? [{ id, title: def.title[locale], reward: def.reward }] : [];
  });
}
