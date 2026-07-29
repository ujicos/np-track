import test from "node:test";
import assert from "node:assert/strict";

import { platformLabel } from "../worker.js";

test("uses Sony's explicit modern platform category", () => {
  assert.equal(platformLabel("ps4_game", "UNKNOWN"), "PS4");
  assert.equal(platformLabel("ps5_native_game", "UNKNOWN"), "PS5");
});

test("infers legacy PS3 games from their title ID", () => {
  assert.equal(platformLabel("unknown", "NPUB30584_00"), "PS3");
  assert.equal(platformLabel("unknown", "BLUS30591"), "PS3");
});

test("infers modern games when Sony returns an unknown category", () => {
  assert.equal(platformLabel("unknown", "CUSA01433_00"), "PS4");
  assert.equal(platformLabel("unknown", "PPSA20599_00"), "PS5");
});
