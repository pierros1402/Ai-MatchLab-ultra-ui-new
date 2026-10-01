import test from "node:test";
import assert from "node:assert/strict";
import { parseRecentResultEvidence, researchRecentResults } from "./recent-results-researcher.js";
import { resolveSlugFromPath } from "../odds/flashscore-league-map.js";

const now = Date.parse("2026-10-01T15:00Z");
const header = "ZA÷EUROPE: UEFA Nations League¬ZY÷Europe¬ZL÷/football/europe/uefa-nations-league/¬~";
const row = (id, extras = "") => `AA÷${id}¬AE÷Greece¬AF÷Israel¬AD÷1790272800¬AB÷3¬AC÷3¬AG÷2¬AH÷1¬${extras}~`;
const page = feed => "cjs.initialFeeds['results'] = { data: `" + feed + "`, allEventsCount: 2 };";

test("research excludes unplayed, future, stale, different competition and conflicting scores; deduplicates repeated feeds", () => {
  const valid = row("valid001");
  const html = page(header + valid + valid + row("live0001", "AB÷2¬") + row("blank001", "AG÷¬")
    + row("extra001", "AC÷11¬") + row("future01", "AD÷1999999999¬") + row("stale001", "AD÷1600000000¬")
    + row("conflict", "AG÷3¬") + row("conflict", "AG÷4¬")
    + "ZA÷ENGLAND: Premier League¬ZL÷/football/england/premier-league/¬~" + row("foreign1"));
  const result = parseRecentResultEvidence(html, "uefa.nations", now);
  assert.deepEqual(result.rows.map(r => r.providerMatchId), ["valid001"]);
  assert.equal(result.rejected.PROVIDER_RESULT_CONFLICT, 1);
  assert.equal(result.rejected.COMPETITION_MISMATCH, 1);
  assert.equal(result.rejected.REGULATION_FINAL_UNCONFIRMED, 3);
  assert.equal(result.rejected.OUTSIDE_RECENT_PAST_WINDOW, 2);
});

test("correct Nations League route returns quarantined evidence and surfaces HTTP/format failures", async () => {
  assert.equal(resolveSlugFromPath("/football/europe/uefa-nations-league/"), "uefa.nations");
  let requests = 0;
  const result = await researchRecentResults("uefa.nations", { nowMs: now, fetchFn: async url => {
    requests++;
    assert.equal(url, "https://www.flashscore.com/football/europe/uefa-nations-league/results/");
    return { ok: true, status: 200, text: async () => page(header + row("valid001")) };
  } });
  assert.equal(requests, 1);
  assert.equal(result.status, "RESULTS_AWAIT_IDENTITY_VALIDATION");
  assert.equal(result.rows.length, 1);
  assert.equal(result.valueInputVerified, false);
  assert.equal(result.canonicalWrites, 0);
  assert.match(result.responseSha256, /^[a-f0-9]{64}$/);
  const missing = await researchRecentResults("uefa.nations", { fetchFn: async () => ({ ok: false, status: 404 }) });
  assert.equal(missing.status, "SOURCE_HTTP_ERROR");
  const changed = await researchRecentResults("uefa.nations", { fetchFn: async () => ({ ok: true, status: 200, text: async () => "<html>new format</html>" }) });
  assert.equal(changed.status, "SOURCE_FORMAT_UNRECOGNIZED");
  const empty = await researchRecentResults("sco.tennents", { fetchFn: async () => ({ ok: true, status: 200, text: async () => page("") }) });
  assert.equal(empty.status, "NO_ELIGIBLE_RECENT_RESULTS", "an explicitly empty season feed is not a parser failure");
  await researchRecentResults("eng.trophy", { fetchFn: async url => {
    assert.equal(url, "https://www.flashscore.com/football/england/efl-trophy/results/");
    return { ok: true, status: 200, text: async () => page("") };
  } });
});
