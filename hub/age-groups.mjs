// Рекомендации по сложности, не официальный рейтинг и не ограничение доступа.
export const AGE_GROUPS = [
  { id: 'under6', minAge: 3, maxAge: 5, games: ['sorting', 'counting', 'jigsaw'] },
  { id: 'age6to9', minAge: 6, maxAge: 9, games: ['pairs', 'color-sort', 'sudoku-kids', 'stack', 'targets', 'flyer', 'snake'] },
  { id: 'age10to13', minAge: 10, maxAge: 13, games: ['block-drop', 'fifteen', '2048', 'sums'] },
  { id: 'age14plus', minAge: 14, maxAge: null, games: ['soz', 'quiz'] },
];

export function categorizeGames(games) {
  const ids = games.map((game) => game.id ?? game.gameId);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate catalog game');
  const assigned = AGE_GROUPS.flatMap((group) => group.games);
  if (new Set(assigned).size !== assigned.length) throw new Error('Duplicate age assignment');
  if (ids.some((id) => !assigned.includes(id)) || assigned.some((id) => !ids.includes(id))) {
    throw new Error('Age categories must cover every catalog game exactly once');
  }
  return AGE_GROUPS.map((group) => ({
    ...group,
    games: group.games.map((id) => games.find((game) => (game.id ?? game.gameId) === id)),
  }));
}

export function ageManifest(manifest) {
  const sections = categorizeGames(manifest.games);
  return {
    ...manifest,
    ageGroups: AGE_GROUPS.map(({ games, ...group }) => group),
    games: manifest.games.map((game) => ({
      ...game,
      ageGroup: sections.find((section) => section.games.includes(game)).id,
    })),
  };
}
