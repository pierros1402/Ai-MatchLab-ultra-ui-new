import test from "node:test";
import assert from "node:assert/strict";
import {classifyLeagueRoot} from "./audit-stage20-league-root-custody.mjs";
test("known state cache and URL memory roots map to source, not replay authority",()=>{
  const state=classifyLeagueRoot("data/league-memory/state.json",Buffer.from("{}"));
  const url=classifyLeagueRoot("data/league-memory/standings-url-cache.json",Buffer.from("{}"));
  assert.equal(state.kind,"storage/league-memory-db.js");
  assert.equal(url.kind,"source-discovery/standings-researcher.js");
  assert.equal(state.verifiedJson,true);
});
test("unknown root remains unqualified, never silently approved",()=>{
  assert.equal(classifyLeagueRoot("data/league-memory/other.json",Buffer.from("{}")).kind,
    "unknown-producer");
});
test("reject path traversal, secret names, malformed JSON and non-object roots",()=>{
  for(const name of [
    "data/league-memory/../foo.json",
    "data/league-memory/private-key.json",
    "data/league-memory/a/extra.json",
    "data/league-memory/root.json.gz"
  ])assert.throws(()=>classifyLeagueRoot(name,Buffer.from("{}")),
    /stage20_league_root_unsafe_name/);
  assert.equal(classifyLeagueRoot("data/league-memory/x.json",Buffer.from("{")).verifiedJson,false);
  assert.equal(classifyLeagueRoot("data/league-memory/x.json",Buffer.from("[]")).verifiedJson,false);
});
