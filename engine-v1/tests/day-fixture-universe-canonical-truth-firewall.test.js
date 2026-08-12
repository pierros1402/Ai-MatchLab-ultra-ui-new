import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeCanonicalWithRuntimeOverlay
} from "../core/day-fixture-universe.js";
import {
  MATCH_STATE_CLASS,
  classifyMatchState,
  hasMatchStateConflict
} from "../core/non-played-state.js";

function merge(canonical, runtime) {
  const result = mergeCanonicalWithRuntimeOverlay(
    [canonical],
    [runtime],
    "2026-08-12"
  );
  assert.equal(result.fixtures.length, 1);
  return result.fixtures[0];
}

test("canonical POSTPONED truth survives stale terminal runtime overlay", () => {
  const canonical = {
    canonicalId: "cid_col2_cartagena_bogota_20260812",
    matchId: "cid_col2_cartagena_bogota_20260812",
    leagueSlug: "col.2",
    homeTeam: "Cartagena",
    awayTeam: "Bogota",
    dayKey: "2026-08-12",
    kickoffUtc: "2026-08-11T22:45:00.000Z",
    status: "STATUS_POSTPONED",
    rawStatus: "STATUS_POSTPONED",
    statusType: "STATUS_POSTPONED",
    scoreHome: null,
    scoreAway: null,
    minute: null,
    penalties: null,
    decidedBy: null
  };

  const runtime = {
    ...canonical,
    status: "FT",
    rawStatus: "STATUS_FULL_TIME",
    statusType: "STATUS_FINAL",
    sourceStatus: "FT",
    providerStatus: "STATUS_FINAL",
    operationalState: "TERMINAL_CONFIRMED",
    scoreHome: 2,
    scoreAway: 1,
    minute: "FT",
    finalized: 1,
    state: "final",
    isDisplayLive: false,
    isDisplayPre: false,
    isDisplayFinal: true
  };

  const row = merge(canonical, runtime);

  assert.equal(classifyMatchState(row), MATCH_STATE_CLASS.PRE_KICKOFF_NON_PLAYED);
  assert.equal(hasMatchStateConflict(row), false);
  assert.equal(row.status, "STATUS_POSTPONED");
  assert.equal(row.rawStatus, "STATUS_POSTPONED");
  assert.equal(row.statusType, "STATUS_POSTPONED");
  assert.equal(row.scoreHome, null);
  assert.equal(row.scoreAway, null);
  assert.equal(row.minute, null);
  assert.equal(row.operationalState, undefined);
  assert.equal(row.sourceStatus, undefined);
  assert.equal(row.providerStatus, undefined);
  assert.equal(row.finalized, undefined);
  assert.equal(row.state, undefined);
  assert.equal(row.isDisplayLive, false);
  assert.equal(row.isDisplayPre, false);
  assert.equal(row.isDisplayFinal, false);
});

test("canonical FT truth survives stale PRE runtime overlay", () => {
  const canonical = {
    canonicalId: "cid_bra2_avai_crb_20260812",
    matchId: "cid_bra2_avai_crb_20260812",
    leagueSlug: "bra.2",
    homeTeam: "Avaí",
    awayTeam: "CRB",
    dayKey: "2026-08-12",
    kickoffUtc: "2026-08-11T22:30:00.000Z",
    status: "FT",
    rawStatus: "STATUS_FULL_TIME",
    statusType: "STATUS_FINAL",
    scoreHome: 0,
    scoreAway: 1,
    minute: "90+5",
    penalties: null,
    decidedBy: null
  };

  const runtime = {
    ...canonical,
    status: "PRE",
    rawStatus: "STATUS_SCHEDULED",
    statusType: "STATUS_SCHEDULED",
    sourceStatus: "STATUS_SCHEDULED",
    providerStatus: "PRE",
    operationalState: "PRE",
    scoreHome: null,
    scoreAway: null,
    minute: null,
    isDisplayLive: false,
    isDisplayPre: true,
    isDisplayFinal: false
  };

  const row = merge(canonical, runtime);

  assert.equal(classifyMatchState(row), MATCH_STATE_CLASS.PLAYED_FINAL);
  assert.equal(hasMatchStateConflict(row), false);
  assert.equal(row.status, "FT");
  assert.equal(row.rawStatus, "STATUS_FULL_TIME");
  assert.equal(row.statusType, "STATUS_FINAL");
  assert.equal(row.scoreHome, 0);
  assert.equal(row.scoreAway, 1);
  assert.equal(row.minute, "90+5");
  assert.equal(row.operationalState, undefined);
  assert.equal(row.sourceStatus, undefined);
  assert.equal(row.providerStatus, undefined);
  assert.equal(row.isDisplayLive, false);
  assert.equal(row.isDisplayPre, false);
  assert.equal(row.isDisplayFinal, true);
});
