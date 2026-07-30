import test from "node:test";
import assert from "node:assert/strict";

import { matchTrophyTitle, platformLabel } from "../worker.js";

test("uses Sony's explicit modern platform category", () => {
  assert.equal(platformLabel("ps4_game", "UNKNOWN"), "PS4");
  assert.equal(platformLabel("ps5_native_game", "UNKNOWN"), "PS5");
});

test("uses the supported console fallback for unclassified port records", () => {
  assert.equal(platformLabel("unknown", "NPUB30584_00"), "PS4 / PS5");
  assert.equal(platformLabel("unknown", "BLUS30591"), "PS4 / PS5");
  assert.equal(platformLabel("unknown", "UNCLASSIFIED"), "PS4 / PS5");
});

test("infers modern games when Sony returns an unknown category", () => {
  assert.equal(platformLabel("unknown", "CUSA01433_00"), "PS4");
  assert.equal(platformLabel("unknown", "PPSA20599_00"), "PS5");
});

test("prefers the concrete title ID over a cross-generation concept", () => {
  assert.equal(
    platformLabel("unknown", "CUSA57548_00", [
      "CUSA57548_00",
      "PPSA33017_00",
    ]),
    "PS4",
  );
  assert.equal(
    platformLabel("unknown", "PPSA33017_00", [
      "CUSA57548_00",
      "PPSA33017_00",
    ]),
    "PS5",
  );
  assert.equal(
    platformLabel("unknown", "UNCLASSIFIED", [
      "CUSA57548_00",
      "PPSA33017_00",
    ]),
    "PS4 / PS5",
  );
});

test("matches duplicate trophy sets to the played game platform", () => {
  const game = {
    localizedName: "Example Game",
    category: "unknown",
    titleId: "CUSA12345_00",
  };
  const titles = [
    {
      trophyTitleName: "Example Game",
      trophyTitlePlatform: "PS5",
      npCommunicationId: "NPWR_PS5",
    },
    {
      trophyTitleName: "Example Game",
      trophyTitlePlatform: "PS4",
      npCommunicationId: "NPWR_PS4",
    },
  ];
  assert.equal(
    matchTrophyTitle(game, titles)?.npCommunicationId,
    "NPWR_PS4",
  );
});
