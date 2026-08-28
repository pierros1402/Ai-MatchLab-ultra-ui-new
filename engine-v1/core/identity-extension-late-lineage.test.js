import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { discoverIdentityRecoveryCandidates } from "./identity-extension-recovery.js";
import { promoteIdentityRecoveryArtifact } from "./identity-extension-promoter.js";
import {
  buildExtendedProductionIdentityResolver,
  validateProductionIdentityExtension,
} from "./production-identity-extension.js";
import { getProductionIdentityResolverRuntime } from "./production-identity-resolver-runtime.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const LEDGER = path.join(
  ROOT,
  "data",
  "identity-decisions",
  "production-identity-extension-ledger.v1.json",
);
const CANONICAL_ROOT = path.join(ROOT, "data", "canonical-fixtures");
const RENNES_PSG_DAY = "2026-08-23";
const RUN_DAY = "2026-08-28";
const LEAGUE = "fra.1";
const RETAINED = "cid_fra1_staderennais_parissaintgermain_20260823";
const SUPPRESSED = "cid_fra1_rennes_psg_20260823";
const BASIS = "TWO_PROVIDER_EXISTING_VALIDATED_EXTENSION_IDENTITIES";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadCurrentPrimaryLedger() {
  return JSON.parse(fs.readFileSync(LEDGER, "utf8"));
}

function rennesPsgRows() {
  const filePath = path.join(CANONICAL_ROOT, RENNES_PSG_DAY, `${LEAGUE}.json`);
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return payload.fixtures.filter(row =>
    row.canonicalId === RETAINED || row.canonicalId === SUPPRESSED
  );
}

function buildLateLineageArtifact() {
  const runtime = getProductionIdentityResolverRuntime();
  const ledger = loadCurrentPrimaryLedger();
  const resolver = buildExtendedProductionIdentityResolver({
    baseResolver: runtime.baseResolver,
    ledger,
  });
  const report = discoverIdentityRecoveryCandidates(rennesPsgRows(), {
    leagueSlug: LEAGUE,
    resolver,
  });

  assert.equal(report.autoPromotable.length, 1);
  assert.equal(report.pendingIndependentConfirmation.length, 0);
  assert.equal(report.autoPromotable[0].recoveryStatus, "AUTO_PROMOTABLE_LINEAGE");

  return {
    schema: "ai-matchlab.identity-recovery-window.v1",
    runDayKey: RUN_DAY,
    summary: {
      autoPromotable: 1,
      pendingIndependentConfirmation: 0,
      ambiguous: 0,
      conflictRejected: 0,
    },
    targetDays: [{
      dayKey: RENNES_PSG_DAY,
      recoveryLeagueReports: [{
        leagueSlug: LEAGUE,
        autoPromotable: report.autoPromotable,
        pendingIndependentConfirmation: [],
      }],
    }],
  };
}

function dryRunLateLineagePromotion() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-late-lineage-"));
  const recoveryArtifactPath = path.join(tempDir, "recovery.json");
  const extensionLedgerPath = path.join(tempDir, "extension.json");
  fs.writeFileSync(
    recoveryArtifactPath,
    `${JSON.stringify(buildLateLineageArtifact(), null, 2)}\n`,
    "utf8",
  );
  fs.copyFileSync(LEDGER, extensionLedgerPath);

  const runtime = getProductionIdentityResolverRuntime();
  return promoteIdentityRecoveryArtifact({
    runDayKey: RUN_DAY,
    recoveryArtifactPath,
    extensionLedgerPath,
    canonicalRoot: CANONICAL_ROOT,
    baseResolver: runtime.baseResolver,
    write: false,
  });
}

test("late-known Rennes/PSG aliases close old fixture lineage without new team identities", () => {
  const result = dryRunLateLineagePromotion();

  assert.equal(result.changed, true);
  assert.equal(result.blocked.length, 0);
  assert.equal(result.promoted.length, 1);
  assert.deepEqual(result.promoted[0].newTeamBindingDecisionIds, []);
  assert.equal(result.validation.ok, true);

  const decision = result.proposedLedger.fixtureLineageDecisions.find(
    row => row.retainedRepositoryFixtureId === RETAINED,
  );
  assert.ok(decision);
  assert.deepEqual(decision.suppressedRepositoryFixtureIds, [SUPPRESSED]);
  assert.equal(decision.promotionBasis, BASIS);
  assert.equal(decision.sourceFixtures.length, 2);
  assert.equal(decision.sourceFixtures[0].provider, "espn");
  assert.equal(decision.sourceFixtures[1].provider, "flashscore");
});

test("validated-extension lineage basis rejects team bindings that only cite the new fixture itself", () => {
  const result = dryRunLateLineagePromotion();
  const ledger = clone(result.proposedLedger);
  const decision = ledger.fixtureLineageDecisions.find(
    row => row.retainedRepositoryFixtureId === RETAINED,
  );
  assert.ok(decision);
  assert.equal(decision.promotionBasis, BASIS);

  const homeBinding = ledger.teamBindings.find(
    row => row.globalClubId === decision.homeGlobalClubId,
  );
  assert.ok(homeBinding);
  homeBinding.sourceFixtureDecisionIds = [decision.fixtureRetentionDecisionId];

  const runtime = getProductionIdentityResolverRuntime();
  const validation = validateProductionIdentityExtension({
    ledger,
    baseResolver: runtime.baseResolver,
  });

  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some(
    issue => issue.code === "EXISTING_EXTENSION_IDENTITY_PROMOTION_BASIS_NOT_PROVEN"
  ));
});
