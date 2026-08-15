import test from "node:test";
import assert from "node:assert/strict";
import { dedupeLeagueDayFixtures } from "./fixture-dedup.js";
import {
  mergeMonotonicStatusObservation,
  projectTrustedResultsTruthFinal,
  shouldAttemptResultsTruthFinal
} from "./canonical-status-monotonicity.js";
import {
  MATCH_STATE_CLASS,
  classifyMatchState
} from "./non-played-state.js";
import { assertCanonicalStatusCoherence } from "./canonical-status-coherence.js";

const dayKey = "2026-08-14";
const kickoffUtc = "2026-08-14T12:00:00.000Z";
const canonicalId = "cid_test1_alpha_beta_20260814";

function writeback(scoreHome = 2, scoreAway = 1) {
  return {
    schema: "ai-matchlab.authoritative-terminal-writeback.v1",
    observation: {
      status: "FT",
      statusType: "STATUS_FINAL",
      rawStatus: "STATUS_FINAL",
      scoreHome,
      scoreAway
    }
  };
}

function scheduledEspn() {
  return {
    canonicalId,
    matchId: canonicalId,
    source: "espn",
    sourceId: "401000001",
    sourceMatchId: "401000001",
    leagueSlug: "test.1",
    dayKey,
    kickoffUtc,
    homeTeam: "Alpha",
    awayTeam: "Beta",
    status: "STATUS_SCHEDULED",
    rawStatus: "STATUS_SCHEDULED"
  };
}

function finalFlashscore() {
  return {
    canonicalId,
    matchId: canonicalId,
    source: "flashscore",
    sourceId: "FS001",
    sourceMatchId: "FS001",
    leagueSlug: "test.1",
    dayKey,
    kickoffUtc,
    homeTeam: "Alpha",
    awayTeam: "Beta",
    status: "FT",
    statusType: "STATUS_FINAL",
    rawStatus: "STATUS_FINAL",
    operationalState: "TERMINAL_CONFIRMED",
    minute: "FT",
    scoreHome: 2,
    scoreAway: 1,
    authoritativeTerminalWriteback: writeback()
  };
}

test("live refresh cannot regress protected terminal truth to scheduled", () => {
  const previous = finalFlashscore();
  const incoming = {
    status: "STATUS_SCHEDULED",
    statusType: "STATUS_SCHEDULED",
    rawStatus: "STATUS_SCHEDULED",
    scoreHome: 0,
    scoreAway: 0,
    lastSeenAt: "2026-08-14T15:00:00.000Z"
  };

  const merged = mergeMonotonicStatusObservation(previous, incoming);
  assert.equal(classifyMatchState(merged), MATCH_STATE_CLASS.PLAYED_FINAL);
  assert.equal(merged.status, "FT");
  assert.equal(merged.scoreHome, 2);
  assert.deepEqual(merged.authoritativeTerminalWriteback, previous.authoritativeTerminalWriteback);
  assertCanonicalStatusCoherence({ fixtures: [merged] });
});

test("dedupe keeps ESPN identity but atomically carries coherent terminal state", () => {
  const { rows } = dedupeLeagueDayFixtures(
    [scheduledEspn(), finalFlashscore()],
    { slug: "test.1" }
  );

  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.source, "espn");
  assert.equal(classifyMatchState(row), MATCH_STATE_CLASS.PLAYED_FINAL);
  assert.equal(row.status, "FT");
  assert.equal(row.rawStatus, "STATUS_FINAL");
  assert.equal(row.scoreHome, 2);
  assert.equal(row.scoreAway, 1);
  assert.ok(row.authoritativeTerminalWriteback);
  assertCanonicalStatusCoherence({ fixtures: [row] });

  const fixedPoint = dedupeLeagueDayFixtures(rows, { slug: "test.1" }).rows;
  assert.deepEqual(fixedPoint, rows);
});

test("dedupe never downgrades an existing coherent final to scheduled", () => {
  const finalEspn = { ...finalFlashscore(), source: "espn", sourceId: "401000001", sourceMatchId: "401000001" };
  const scheduledFs = { ...scheduledEspn(), source: "flashscore", sourceId: "FS001", sourceMatchId: "FS001" };
  const { rows } = dedupeLeagueDayFixtures([finalEspn, scheduledFs], { slug: "test.1" });
  assert.equal(rows.length, 1);
  assert.equal(classifyMatchState(rows[0]), MATCH_STATE_CLASS.PLAYED_FINAL);
  assert.equal(rows[0].scoreHome, 2);
  assert.equal(rows[0].scoreAway, 1);
});

test("results truth repairs the complete scheduled/final conflict bundle", () => {
  const broken = {
    ...scheduledEspn(),
    statusType: "STATUS_FINAL",
    sourceStatus: "STATUS_SCHEDULED",
    scoreHome: 2,
    scoreAway: 1,
    authoritativeTerminalWriteback: writeback()
  };

  assert.equal(classifyMatchState(broken), MATCH_STATE_CLASS.CONFLICT);
  assert.throws(
    () => assertCanonicalStatusCoherence({ fixtures: [broken] }),
    /canonical_status_coherence_failed/
  );
  assert.equal(shouldAttemptResultsTruthFinal(broken), true);

  const repaired = projectTrustedResultsTruthFinal(broken, { scoreHome: 2, scoreAway: 1 });
  assert.equal(classifyMatchState(repaired), MATCH_STATE_CLASS.PLAYED_FINAL);
  assert.equal(repaired.status, "FT");
  assert.equal(repaired.statusType, "STATUS_FINAL");
  assert.equal(repaired.rawStatus, "STATUS_FINAL");
  assert.equal(repaired.sourceStatus, undefined);
  assert.equal(repaired.resultSource, "league-memory");
  assertCanonicalStatusCoherence({ fixtures: [repaired] });
});

test("protected non-played evidence is never converted to final by results truth", () => {
  const postponedConflict = {
    ...scheduledEspn(),
    status: "STATUS_POSTPONED",
    statusType: "STATUS_FINAL",
    rawStatus: "STATUS_POSTPONED"
  };
  assert.equal(shouldAttemptResultsTruthFinal(postponedConflict), false);
  const same = projectTrustedResultsTruthFinal(postponedConflict, { scoreHome: 2, scoreAway: 1 });
  assert.equal(same, postponedConflict);
});

test("results truth does not overwrite disagreeing authoritative terminal score", () => {
  const broken = {
    ...scheduledEspn(),
    statusType: "STATUS_FINAL",
    scoreHome: 2,
    scoreAway: 1,
    authoritativeTerminalWriteback: writeback(2, 1)
  };
  const same = projectTrustedResultsTruthFinal(broken, { scoreHome: 3, scoreAway: 1 });
  assert.equal(same, broken);
});
