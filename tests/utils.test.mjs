import test from "node:test";
import assert from "node:assert/strict";

import {
  earnedTrophiesFirst,
  findGamesForCombination,
  findGamesByTitleId,
  formatDuration,
  formatLongDuration,
  isShareFactoryTitle,
  normaliseNpssoInput,
  normaliseTitleId,
} from "../utils.js";

test("formats single-digit playtime without padding", () => {
  assert.equal(formatDuration(3661), "1h 1m 1s");
});

test("formats multi-digit playtime without changing complete values", () => {
  assert.equal(formatDuration(36610), "10h 10m 10s");
});

test("does not pad smaller minute or second components", () => {
  assert.equal(formatDuration(10 * 3600 + 61), "10h 1m 1s");
});

test("keeps the full hour count without commas or milliseconds", () => {
  assert.equal(formatDuration(923 * 3600 + 48 * 60 + 46.99), "923h 48m 46s");
});

test("describes long playtime as approximate calendar-sized units", () => {
  assert.equal(
    formatLongDuration(2 * 365 * 86400 + 3 * 30 * 86400 + 4 * 86400),
    "2 years, 3 months, 4 days",
  );
  assert.equal(
    formatLongDuration(2 * 30 * 86400 + 5 * 86400),
    "2 months, 5 days",
  );
  assert.equal(
    formatLongDuration(2 * 86400 + 3 * 3600 + 4 * 60 + 5),
    "2 days, 3 hours, 4 minutes, 5 seconds",
  );
});

test("recognises Sony's Share Factory title variants", () => {
  assert.equal(isShareFactoryTitle("Share Factory Studio"), true);
  assert.equal(isShareFactoryTitle("SHAREfactory™ Studio"), true);
  assert.equal(isShareFactoryTitle("Share Factory"), true);
  assert.equal(isShareFactoryTitle("Share Play"), false);
});

test("matches an exact PSN title ID for multi-profile playtime", () => {
  const games = [
    { name: "PS4 game", titleId: "CUSA57548_00", playTimeSeconds: 20 },
    { name: "PS5 game", titleId: "PPSA44222_00", playTimeSeconds: 30 },
  ];
  assert.deepEqual(findGamesByTitleId(games, "cusa57548"), [games[0]]);
  assert.deepEqual(findGamesByTitleId(games, "CUSA57548_00"), [games[0]]);
  assert.deepEqual(findGamesByTitleId(games, "CUSA00000"), []);
  assert.equal(normaliseTitleId(" ppsa44222_00 "), "PPSA44222");
});

test("only combines PS4 and PS5 siblings when cross-generation is enabled", () => {
  const games = [
    { titleId: "CUSA57548_00", conceptId: 100, platform: "PS4" },
    { titleId: "PPSA57548_00", conceptId: 100, platform: "PS5" },
    { titleId: "NPUB57548_00", conceptId: 100, platform: "PS3" },
    { titleId: "PPSA99999_00", conceptId: 999, platform: "PS5" },
  ];
  assert.deepEqual(
    findGamesForCombination(games, "CUSA57548", {
      combineCrossGeneration: false,
      conceptIds: [100],
    }),
    [games[0]],
  );
  assert.deepEqual(
    findGamesForCombination(games, "CUSA57548", {
      combineCrossGeneration: true,
      conceptIds: [100],
    }),
    [games[0], games[1]],
  );
});

test("puts earned trophies before locked trophies without changing group order", () => {
  const trophies = [
    { trophyId: 1, earned: false },
    { trophyId: 2, earned: true },
    { trophyId: 3, earned: false },
    { trophyId: 4, earned: true },
  ];
  assert.deepEqual(
    earnedTrophiesFirst(trophies).map((trophy) => trophy.trophyId),
    [2, 4, 1, 3],
  );
  assert.deepEqual(
    earnedTrophiesFirst(trophies, true).map((trophy) => trophy.trophyId),
    [1, 2, 3, 4],
  );
});

test("accepts a raw NPSSO cookie value", () => {
  assert.equal(normaliseNpssoInput("npsso=abc123"), "abc123");
});

test("accepts the complete Sony ssocookie JSON response", () => {
  assert.equal(
    normaliseNpssoInput('{"npsso":"abc123","expires_in":5183983}'),
    "abc123",
  );
});
