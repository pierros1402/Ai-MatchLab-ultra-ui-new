import test from "node:test";
import assert from "node:assert/strict";
import { selectTeamHistoryTargets, researchTeamHistory } from "./team-history-researcher.js";
const now = Date.parse("2026-10-04T06:00Z");
const fixture = { canonicalId: "cid_test", leagueSlug: "eng.fa", homeTeam: "Home", awayTeam: "Away", kickoffUtc: "2026-10-04T14:00Z", providerIds: { flashscore: "match001" } };
const anchor = { leagueSlug: fixture.leagueSlug, providerMatchId: "match001", home: "Home", away: "Away", kickoffUtc: fixture.kickoffUtc,
  homeProviderTeamId: "home0001", awayProviderTeamId: "away0001", homeProviderTeamSlug: "home-fc", awayProviderTeamSlug: "away-fc" };
const incident = { ...fixture, modelInputDiagnosis: { homeSample: 1, awaySample: 6 } };
const evidence = { upcomingAnchors: [anchor] };
const target = selectTeamHistoryTargets(evidence, [incident], [fixture], {}, now).targets[0];
test("team research requires an exact future anchor and targets only insufficient sides", () => {
  assert.equal(target.providerTeamId, "home0001");
  assert.equal(selectTeamHistoryTargets(evidence, [incident], [fixture], {}, now).targets.length, 1);
  for (const changed of [{ ...anchor, providerMatchId: "wrong001" }, { ...anchor, home: "Home FC" },
    { ...anchor, kickoffUtc: "2026-10-04T15:00Z" }, { ...anchor, homeProviderTeamSlug: "../unsafe" }]) {
    assert.equal(selectTeamHistoryTargets({ upcomingAnchors: [changed] }, [incident], [fixture], {}, now).targets.length, 0);
  }
  assert.equal(selectTeamHistoryTargets(evidence, [incident], [fixture], {}, Date.parse("2026-10-04T14:01Z")).targets.length, 0);
});
test("bounded team research rotates rather than starving the other side", () => {
  const both = { ...incident, modelInputDiagnosis: { homeSample: 1, awaySample: 1 } };
  const first = selectTeamHistoryTargets(evidence, [both], [fixture], {}, now, 1);
  const next = selectTeamHistoryTargets(evidence, [both], [fixture], { [first.targets[0].key]: { attemptedAt: new Date(now).toISOString() } }, now, 1);
  assert.notEqual(first.targets[0].key, next.targets[0].key);
  assert.equal(first.deferred, 1);
});
const row = (id, native = "home0001", extra = "") => `AA÷${id}¬AE÷Home¬AF÷Opponent¬PX÷${native}¬PY÷other001¬AD÷1790769600¬AB÷3¬AC÷3¬AG÷2¬AH÷1¬${extra}~`;
const page = feed => "cjs.initialFeeds['results'] = {data: `" + feed + "`};";
test("profile candidates retain exact competition and team identity, with no truth promotion", async () => {
  const html = page("ZA÷ENGLAND: National League¬ZL÷/football/england/national-league/¬~" + row("valid001") + row("foreign1", "other002")
    + row("live0001", "home0001", "AB÷2¬") + "ZA÷ENGLAND: Unknown League¬ZL÷/football/england/unmapped-regional/¬~" + row("unknown1"));
  const result = await researchTeamHistory(target, { nowMs: now, fetchFn: async url => {
    assert.equal(url, "https://www.flashscore.com/team/home-fc/home0001/results/");
    return { ok: true, text: async () => html };
  } });
  assert.equal(result.status, "TEAM_RESULTS_AWAIT_CANONICAL_FINAL_VALIDATION");
  assert.equal(result.documents[0].leagueSlug, "eng.5");
  assert.deepEqual(result.documents[0].rows.map(r => r.providerMatchId), ["valid001"]);
  assert.deepEqual(result.unmappedCompetitions, ["/football/england/unmapped-regional/"]);
  assert.equal(result.canonicalWrites, 0);
  assert.equal(result.valueInputVerified, false);
});
test("missing profile identity, HTTP errors and empty pages are distinct evidence failures", async () => {
  const get = html => ({ nowMs: now, fetchFn: async () => ({ ok: true, text: async () => html }) });
  assert.equal((await researchTeamHistory(target, get(page(row("other001", "wrong001"))))).status, "TEAM_PROFILE_IDENTITY_MISMATCH");
  assert.equal((await researchTeamHistory(target, get(page("")))).status, "NO_ELIGIBLE_RECENT_RESULTS");
  assert.equal((await researchTeamHistory(target, get("changed format"))).status, "SOURCE_FORMAT_UNRECOGNIZED");
  assert.equal((await researchTeamHistory(target, { fetchFn: async () => ({ ok: false, status: 503 }) })).status, "SOURCE_HTTP_ERROR");
});
