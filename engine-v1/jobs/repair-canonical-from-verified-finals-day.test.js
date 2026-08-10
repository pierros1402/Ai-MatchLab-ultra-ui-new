import test from "node:test";
import assert from "node:assert/strict";

import {
  authorizeAppliedTerminalScoreRevision,
  planCanonicalVerifiedFinalRepair,
} from "./repair-canonical-from-verified-finals-day.js";

function canonical(overrides = {}) {
  return {
    canonicalId: "cid_test_home_away_20260808",
    matchId: "cid_test_home_away_20260808",
    dayKey: "2026-08-08",
    homeTeam: "Home FC",
    awayTeam: "Away FC",
    status: "STATUS_SCHEDULED",
    rawStatus: "STATUS_FINAL",
    statusType: "STATUS_FINAL",
    scoreHome: 0,
    scoreAway: 0,
    ...overrides,
  };
}

function final(overrides = {}) {
  return {
    verifiedFinalTruth: true,
    finalTruthVerdict: "verified_final_result",
    matchId: "cid_test_home_away_20260808",
    dayKey: "2026-08-08",
    homeTeam: "Home FC",
    awayTeam: "Away FC",
    scoreHome: 3,
    scoreAway: 1,
    source: "test",
    ...overrides,
  };
}

function plan(canonicalRow, finalRow) {
  return planCanonicalVerifiedFinalRepair({
    dayKey: "2026-08-08",
    canonicalEntries: [{ filePath: "/tmp/x.json", name: "x.json", row: canonicalRow, index: 0 }],
    finalEntries: [{ filePath: "/tmp/f.json", name: "f.json", row: finalRow }],
    repairedAt: "2026-08-09T12:00:00.000Z",
  });
}

function planDay(dayKey, canonicalRows, finalRows) {
  return planCanonicalVerifiedFinalRepair({
    dayKey,
    canonicalEntries: canonicalRows.map((row, index) => ({
      filePath: `/tmp/canonical-${index}.json`,
      name: `canonical-${index}.json`,
      row,
      index: 0,
    })),
    finalEntries: finalRows.map((row, index) => ({
      filePath: `/tmp/final-${index}.json`,
      name: `final-${index}.json`,
      row,
    })),
    repairedAt: "2026-08-10T03:45:00.000Z",
  });
}

test("repairs mixed scheduled/final row only from exact verified final truth", () => {
  const result = plan(canonical(), final());
  assert.equal(result.actionCount, 1);
  assert.equal(result.blockedCount, 0);
  const row = result.actions[0].after;
  assert.equal(row.status, "FT");
  assert.equal(row.rawStatus, "STATUS_FINAL");
  assert.equal(row.statusType, "STATUS_FINAL");
  assert.equal(row.operationalState, "TERMINAL_CONFIRMED");
  assert.equal(row.scoreHome, 3);
  assert.equal(row.scoreAway, 1);
  assert.equal(row.canonicalTruthRepair.previousStatus, "STATUS_SCHEDULED");
});

test("repairs the two 2026-08-09 mixed scheduled/final canonical rows from exact verified finals", () => {
  const dayKey = "2026-08-09";
  const canonicalRows = [
    {
      canonicalId: "cid_isl1_breidablik_valur_20260809",
      matchId: "cid_isl1_breidablik_valur_20260809",
      dayKey,
      kickoffUtc: "2026-08-09T20:15:00.000Z",
      homeTeam: "Breidablik",
      awayTeam: "Valur",
      source: "flashscore",
      sourceId: "tWcrZ3Mr",
      sourceMatchId: "tWcrZ3Mr",
      status: "STATUS_SCHEDULED",
      rawStatus: "STATUS_SCHEDULED",
      statusType: "STATUS_FINAL",
      minute: "FT",
      scoreHome: 0,
      scoreAway: 0,
    },
    {
      canonicalId: "cid_per2_comerciantes_tacnaheroica_20260809",
      matchId: "cid_per2_comerciantes_tacnaheroica_20260809",
      dayKey,
      kickoffUtc: "2026-08-09T20:30:00.000Z",
      homeTeam: "Comerciantes",
      awayTeam: "Tacna Heroica",
      source: "flashscore",
      sourceId: "2TB5du3s",
      sourceMatchId: "2TB5du3s",
      status: "STATUS_SCHEDULED",
      rawStatus: "STATUS_SCHEDULED",
      statusType: "STATUS_FINAL",
      minute: "FT",
      scoreHome: 0,
      scoreAway: 0,
    },
  ];
  const finalRows = [
    {
      schema: "ai-matchlab.verified-final-result.v1",
      verifiedFinalTruth: true,
      finalTruthVerdict: "verified_final_result",
      verdict: "verified_final_result",
      matchId: "cid_isl1_breidablik_valur_20260809",
      dayKey,
      kickoffUtc: "2026-08-09T20:15:00.000Z",
      homeTeam: "Breidablik",
      awayTeam: "Valur",
      scoreHome: 1,
      scoreAway: 3,
      source: "flashscore_same_day_exact_team_match",
    },
    {
      schema: "ai-matchlab.verified-final-result.v1",
      verifiedFinalTruth: true,
      finalTruthVerdict: "verified_final_result",
      verdict: "verified_final_result",
      matchId: "cid_per2_comerciantes_tacnaheroica_20260809",
      dayKey,
      kickoffUtc: "2026-08-09T20:30:00.000Z",
      homeTeam: "Comerciantes",
      awayTeam: "Tacna Heroica",
      scoreHome: 2,
      scoreAway: 2,
      source: "flashscore_same_day_exact_team_match",
    },
  ];

  const result = planDay(dayKey, canonicalRows, finalRows);
  assert.equal(result.actionCount, 2);
  assert.equal(result.blockedCount, 0);

  const byId = new Map(
    result.actions.map(action => [action.matchId, action.after]),
  );
  assert.equal(
    byId.get("cid_isl1_breidablik_valur_20260809").status,
    "FT",
  );
  assert.equal(
    byId.get("cid_isl1_breidablik_valur_20260809").scoreHome,
    1,
  );
  assert.equal(
    byId.get("cid_isl1_breidablik_valur_20260809").scoreAway,
    3,
  );
  assert.equal(
    byId.get("cid_per2_comerciantes_tacnaheroica_20260809").status,
    "FT",
  );
  assert.equal(
    byId.get("cid_per2_comerciantes_tacnaheroica_20260809").scoreHome,
    2,
  );
  assert.equal(
    byId.get("cid_per2_comerciantes_tacnaheroica_20260809").scoreAway,
    2,
  );
});

test("repairs clean pre-kickoff row when exact verified final exists", () => {
  const result = plan(canonical({ rawStatus: "STATUS_SCHEDULED", statusType: undefined, scoreHome: null, scoreAway: null }), final());
  assert.equal(result.actionCount, 1);
  assert.equal(result.blockedCount, 0);
});

test("does not auto-repair an already terminal score conflict", () => {
  const result = plan(canonical({ status: "FT", rawStatus: "STATUS_FINAL", statusType: "STATUS_FINAL", scoreHome: 0, scoreAway: 0 }), final({ scoreHome: 4, scoreAway: 0 }));
  assert.equal(result.actionCount, 0);
  assert.equal(result.blockedCount, 1);
  assert.equal(result.blocked[0].reason, "PLAYED_FINAL_SCORE_CONFLICT_NEEDS_ADJUDICATION");
});

test("repairs terminal score only from exact applied provider revision evidence", () => {
  const canonicalRow = canonical({
    canonicalId: "cid_eng1_sholing_bath_20260808",
    matchId: "cid_eng1_sholing_bath_20260808",
    homeTeam: "Sholing",
    awayTeam: "Bath",
    status: "FT",
    rawStatus: "STATUS_FINAL",
    statusType: "STATUS_FINAL",
    scoreHome: 1,
    scoreAway: 0,
    source: "flashscore",
    sourceId: "vRGob3x8",
    sourceMatchId: "vRGob3x8",
  });
  const finalRow = final({
    matchId: "cid_eng1_sholing_bath_20260808",
    homeTeam: "Sholing",
    awayTeam: "Bath",
    scoreHome: 1,
    scoreAway: 2,
    source: "flashscore_same_day_exact_team_match",
    terminalScoreRevision: {
      policyVersion: "flashscore-terminal-revision-v1",
      state: "APPLIED",
      provider: "flashscore",
      providerMatchId: "vRGob3x8",
      previousScore: "1-0",
      correctedScore: "1-2",
      firstObservedAt: "2026-08-09T05:02:24.091Z",
      lastObservedAt: "2026-08-09T17:53:03.695Z",
      observationCount: 2,
      stableForMs: 46239604,
      appliedAt: "2026-08-09T17:53:03.695Z",
      oddsUsed: false,
    },
  });

  const authorization =
    authorizeAppliedTerminalScoreRevision(
      canonicalRow,
      finalRow,
    );
  assert.equal(authorization.ok, true);
  assert.equal(
    authorization.method,
    "validated_applied_terminal_score_revision",
  );

  const result = plan(canonicalRow, finalRow);
  assert.equal(result.actionCount, 1);
  assert.equal(result.blockedCount, 0);
  assert.equal(
    result.actions[0].reason,
    "CANONICAL_TERMINAL_SCORE_REVISED_BY_VERIFIED_PROVIDER_EVIDENCE",
  );
  assert.equal(result.actions[0].after.scoreHome, 1);
  assert.equal(result.actions[0].after.scoreAway, 2);
  assert.equal(
    result.actions[0].after.canonicalTruthRepair
      .terminalScoreRevisionAuthorization.providerMatchId,
    "vRGob3x8",
  );
});

test("terminal revision fails closed when provider identity, previous score, or stability is wrong", () => {
  const canonicalRow = canonical({
    status: "FT",
    rawStatus: "STATUS_FINAL",
    statusType: "STATUS_FINAL",
    scoreHome: 1,
    scoreAway: 0,
    source: "flashscore",
    sourceId: "vRGob3x8",
    sourceMatchId: "vRGob3x8",
  });

  const baseRevision = {
    policyVersion: "flashscore-terminal-revision-v1",
    state: "APPLIED",
    provider: "flashscore",
    providerMatchId: "vRGob3x8",
    previousScore: "1-0",
    correctedScore: "3-1",
    observationCount: 2,
    stableForMs: 600000,
    oddsUsed: false,
  };

  let result = plan(
    canonicalRow,
    final({ terminalScoreRevision: { ...baseRevision, providerMatchId: "other" } }),
  );
  assert.equal(result.actionCount, 0);
  assert.equal(
    result.blocked[0].terminalRevisionReason,
    "TERMINAL_REVISION_PROVIDER_ID_MISMATCH",
  );

  result = plan(
    canonicalRow,
    final({ terminalScoreRevision: { ...baseRevision, previousScore: "0-0" } }),
  );
  assert.equal(result.actionCount, 0);
  assert.equal(
    result.blocked[0].terminalRevisionReason,
    "TERMINAL_REVISION_PREVIOUS_SCORE_MISMATCH",
  );

  result = plan(
    canonicalRow,
    final({ terminalScoreRevision: { ...baseRevision, stableForMs: 1000 } }),
  );
  assert.equal(result.actionCount, 0);
  assert.equal(
    result.blocked[0].terminalRevisionReason,
    "TERMINAL_REVISION_STABILITY_INSUFFICIENT",
  );
});

test("refuses team mismatch and unverified final truth", () => {
  let result = plan(canonical(), final({ homeTeam: "Other FC" }));
  assert.equal(result.actionCount, 0);
  assert.equal(result.blocked[0].reason, "TEAM_PAIR_MISMATCH");

  result = plan(canonical(), final({ verifiedFinalTruth: false }));
  assert.equal(result.actionCount, 0);
  assert.equal(result.blocked[0].reason, "FINAL_TRUTH_NOT_VERIFIED");
});
