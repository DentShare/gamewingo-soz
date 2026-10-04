import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { AGE_GROUPS, categorizeGames, ageManifest } from '../hub/age-groups.mjs';

const manifest = JSON.parse(readFileSync(new URL('../games/manifest.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../hub/index.html', import.meta.url), 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

test('каждая игра имеет ровно одну возрастную группу; хаб совпадает с манифестом', () => {
  const setup = script.slice(script.indexOf('const P ='), script.indexOf('const byId'));
  const catalog = vm.runInNewContext(setup + '\nALL;', { window: {}, categorizeGames });
  assert.deepEqual(Array.from(catalog, (game) => game.id).sort(), manifest.games.map((game) => game.gameId).sort());
  assert.equal(categorizeGames(catalog).flatMap((group) => group.games).length, manifest.games.length);
  assert.deepEqual(AGE_GROUPS[0].games, ['sorting', 'counting', 'jigsaw']);
});

test('границы групп не пересекаются, новая игра без классификации — ошибка', () => {
  for (let i = 1; i < AGE_GROUPS.length; i++) assert.equal(AGE_GROUPS[i].minAge, AGE_GROUPS[i - 1].maxAge + 1);
  assert.throws(() => categorizeGames([...manifest.games, { gameId: 'new-game' }]));
  assert.throws(() => categorizeGames([...manifest.games, manifest.games[0]]));
});

test('публичный манифест содержит возрастные группы, не меняя подсказки, URL и детский режим', () => {
  const enriched = ageManifest(manifest);
  assert.equal(enriched.ageGroups.length, 4);
  enriched.games.forEach((game, index) => {
    assert.ok(AGE_GROUPS.some((group) => group.id === game.ageGroup && group.games.includes(game.gameId)));
    const { ageGroup, ...original } = game;
    assert.deepEqual(original, manifest.games[index]);
  });
});

test('RU/UZ: названия и пояснения есть у каждой группы', () => {
  const strings = script.slice(script.indexOf('const STR ='), script.indexOf("let lang = 'ru'"));
  const STR = vm.runInNewContext(strings + '\nSTR;');
  for (const locale of ['ru', 'uz']) for (const group of AGE_GROUPS) {
    assert.ok(STR[locale].ageTitles[group.id]);
    assert.ok(STR[locale].ageDescriptions[group.id]);
  }
});
