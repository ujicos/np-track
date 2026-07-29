import test from "node:test";
import assert from "node:assert/strict";

import { formatDuration, normaliseNpssoInput } from "../utils.js";

test("formats single-digit playtime without padding", () => {
  assert.equal(formatDuration(3661), "1h 1m 1s");
});

test("formats multi-digit playtime with two-digit groups", () => {
  assert.equal(formatDuration(36610), "10h 10m 10s");
});

test("keeps the full hour count without commas or milliseconds", () => {
  assert.equal(formatDuration(923 * 3600 + 48 * 60 + 46.99), "923h 48m 46s");
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
