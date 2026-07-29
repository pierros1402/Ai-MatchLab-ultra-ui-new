import assert from "node:assert/strict";
import test from "node:test";
import { buildLeagueFormTable } from "./details-rich-blocks.js";

test("league form table fails closed without standings", () => {
  assert.deepEqual(buildLeagueFormTable("bra.1", [], "2026-07-29T20:00:00Z").rows, []);
});
