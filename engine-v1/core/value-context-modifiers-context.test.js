import test from "node:test";
import assert from "node:assert/strict";
import { applyValueContextModifiers, createValueModifierContext } from "./value-context-modifiers.js";
const season = "2026-2027";
const fixture = { id: "one", season, leagueSlug: "eng.1", homeTeam: "Home", awayTeam: "Away", kickoffUtc: "2026-11-01T18:00:00Z" };
const baseValue = { confidence: .7, homeWinScore: .6, drawScore: .2, awayWinScore: .2, over25Score: .65, bttsScore: .55 };
const inputs = { teamForm: {}, leagueForm: {}, matchups: {} };
function loaders() {
  const calls = { indexes: 0, fixtures: 0 };
  return { calls, readers: { readIndexes: async () => { calls.indexes++; return inputs; }, readFixtures: async () => { calls.fixtures++; return { fixtures: [] }; } } };
}
test("191 fixtures retain exact modifier decisions while loading each input only once per batch", async () => {
  const fresh = loaders(), shared = loaders(), context = createValueModifierContext(shared.readers);
  const before = JSON.stringify({ fixture, baseValue, inputs });
  for (let i = 0; i < 191; i++) {
    const row = { ...fixture, id: `match-${i}` };
    const expected = await applyValueContextModifiers({ fixture: row, baseValue, opts: { modifierContext: createValueModifierContext(fresh.readers) } });
    const actual = await applyValueContextModifiers({ fixture: row, baseValue, opts: { modifierContext: context } });
    assert.deepEqual(actual, expected);
  }
  assert.deepEqual(shared.calls, { indexes: 1, fixtures: 1 });
  assert.deepEqual(fresh.calls, { indexes: 191, fixtures: 191 });
  assert.equal(JSON.stringify({ fixture, baseValue, inputs }), before);
});
test("a new invocation observes new fixtures and failed reads retry instead of poisoning a batch", async () => {
  let rows = [], attempts = 0;
  const readers = { readIndexes: async () => inputs, readFixtures: async () => rows };
  const context = createValueModifierContext(readers);
  assert.deepEqual((await context.read(season)).fixturesDb, []);
  rows = [{ ...fixture, kickoffUtc: "2026-11-02T18:00Z" }];
  assert.deepEqual((await context.read(season)).fixturesDb, []);
  assert.equal((await createValueModifierContext(readers).read(season)).fixturesDb.length, 1);
  const retry = createValueModifierContext({ ...readers, readIndexes: async () => { if (++attempts === 1) throw Error("read failed"); return inputs; } });
  await assert.rejects(retry.read(season), /read failed/);
  assert.deepEqual((await retry.read(season)).indexes, inputs);
  assert.equal(attempts, 2);
});
