from pathlib import Path
from textwrap import dedent

core = Path("engine-v1/core/day-fixture-universe.js")
source = core.read_text(encoding="utf-8")

import_anchor = '''import {
  getProductionIdentityResolver
} from "./production-identity-resolver-runtime.js";
'''
import_block = import_anchor + '''import {
  MATCH_STATE_CLASS,
  classifyMatchState
} from "./non-played-state.js";
'''

if 'from "./non-played-state.js"' not in source:
    if source.count(import_anchor) != 1:
        raise SystemExit(f"import-anchor-count:{source.count(import_anchor)}")
    source = source.replace(import_anchor, import_block, 1)

helper_anchor = "export function mergeCanonicalWithRuntimeOverlay(\n"
helper = dedent('''
const CANONICAL_RUNTIME_TRUTH_LOCKS = new Set([
  MATCH_STATE_CLASS.PRE_KICKOFF_NON_PLAYED,
  MATCH_STATE_CLASS.PLAY_INTERRUPTED,
  MATCH_STATE_CLASS.TEMPORARY_DELAY,
  MATCH_STATE_CLASS.RESULT_INVALIDATED,
  MATCH_STATE_CLASS.PLAYED_FINAL
]);

const CANONICAL_RUNTIME_TRUTH_FIELDS = Object.freeze([
  "status", "rawStatus", "statusType",
  "sourceStatus", "sourceStatusType",
  "providerStatus", "providerStatusType",
  "statusName", "operationalState",
  "scoreHome", "scoreAway", "homeScore", "awayScore",
  "minute", "penalties", "decidedBy"
]);

function applyCanonicalTruthFirewall(canonical, runtime) {
  const overlay = { ...(runtime || {}) };
  const canonicalState = classifyMatchState(canonical);

  if (!CANONICAL_RUNTIME_TRUTH_LOCKS.has(canonicalState)) {
    return overlay;
  }

  for (const field of CANONICAL_RUNTIME_TRUTH_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(canonical || {}, field)) {
      overlay[field] = canonical[field];
    } else {
      delete overlay[field];
    }
  }

  if (canonicalState === MATCH_STATE_CLASS.PRE_KICKOFF_NON_PLAYED) {
    if (!Object.prototype.hasOwnProperty.call(canonical || {}, "finalized") && Number(overlay.finalized) === 1) {
      delete overlay.finalized;
    }
    if (!Object.prototype.hasOwnProperty.call(canonical || {}, "state") && String(overlay.state || "").trim().toUpperCase() === "FINAL") {
      delete overlay.state;
    }
    overlay.isDisplayLive = false;
    overlay.isDisplayPre = false;
    overlay.isDisplayFinal = false;
  }

  if (canonicalState === MATCH_STATE_CLASS.PLAYED_FINAL) {
    overlay.isDisplayLive = false;
    overlay.isDisplayPre = false;
    overlay.isDisplayFinal = true;
  }

  return overlay;
}

''')

if "function applyCanonicalTruthFirewall" not in source:
    if source.count(helper_anchor) != 1:
        raise SystemExit(f"helper-anchor-count:{source.count(helper_anchor)}")
    source = source.replace(helper_anchor, helper + helper_anchor, 1)

merge_anchor = dedent('''
        runtimeOverlayCount += 1;

        return canonicalizeFixtureDisplayNames({
          ...canonical,
          ...runtime,
''').lstrip("\n")
merge_replacement = dedent('''
        runtimeOverlayCount += 1;

        const runtimeOverlay =
          applyCanonicalTruthFirewall(
            canonical,
            runtime
          );

        return canonicalizeFixtureDisplayNames({
          ...canonical,
          ...runtimeOverlay,
''').lstrip("\n")

if source.count(merge_anchor) != 1:
    raise SystemExit(f"merge-anchor-count:{source.count(merge_anchor)}")
source = source.replace(merge_anchor, merge_replacement, 1)
core.write_text(source, encoding="utf-8")

test_file = Path("engine-v1/tests/day-fixture-universe-canonical-truth-firewall.test.js")
test_file.write_text(dedent('''
import assert from "node:assert/strict";
import test from "node:test";
import { mergeCanonicalWithRuntimeOverlay } from "../core/day-fixture-universe.js";
import { MATCH_STATE_CLASS, classifyMatchState, hasMatchStateConflict } from "../core/non-played-state.js";

function merged(canonical, runtime) {
  return mergeCanonicalWithRuntimeOverlay([canonical], [runtime], "2026-08-12").fixtures[0];
}

test("canonical POSTPONED cannot be contradicted by stale runtime terminal truth", () => {
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
    isDisplayFinal: true
  };
  const row = merged(canonical, runtime);
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
  assert.equal(row.isDisplayFinal, false);
  assert.equal(row.isDisplayPre, false);
  assert.equal(row.isDisplayLive, false);
});

test("canonical FT cannot be contradicted by stale runtime PRE truth", () => {
  const canonical = {
    canonicalId: "cid_bra2_avai_crb_20260812",
    matchId: "cid_bra2_avai_crb_20260812",
    leagueSlug: "bra.2",
    homeTeam: "Avai",
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
    isDisplayPre: true,
    isDisplayFinal: false
  };
  const row = merged(canonical, runtime);
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
  assert.equal(row.isDisplayFinal, true);
  assert.equal(row.isDisplayPre, false);
  assert.equal(row.isDisplayLive, false);
});
''').lstrip("\n"), encoding="utf-8")

print("canonical-runtime-truth-firewall-patch-applied")
