import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  createProductionEvidenceIdentityOverlay,
} from "./production-evidence-identity-overlay.js";

export const P0C_PLAN_A_IDENTITY_OVERLAY_SCHEMA =
  "ai-matchlab.plan-a-identity-overlay.v1";

function clean(value) {
  return String(value ?? "").trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, stableValue(value[key])]),
    );
  }
  return value;
}

export function stableCanonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

export function sha256CanonicalValue(value) {
  return crypto
    .createHash("sha256")
    .update(stableCanonicalJson(value))
    .digest("hex");
}

function pickRows(plan = {}) {
  if (Array.isArray(plan.picks)) return plan.picks;
  if (Array.isArray(plan.entries)) return plan.entries;
  if (Array.isArray(plan.rows)) return plan.rows;
  return [];
}

function fixtureIdOf(pick = {}) {
  return clean(
    pick.canonicalId ||
    pick.matchId ||
    pick.fixtureId ||
    pick.id,
  );
}

export function planAIdentityOverlayRelativePath(dayKey) {
  const date = clean(dayKey);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("p0c_plan_a_day_key_invalid");
  }
  return `data/value-plans/${date}/plan-a.identity-overlay.v1.json`;
}

export function buildPlanAIdentityOverlay({
  dayKey,
  immutablePlan,
  canonicalFixtureIds,
  overlay = createProductionEvidenceIdentityOverlay(),
  sourcePath = null,
} = {}) {
  const date = clean(dayKey);
  const rows = pickRows(immutablePlan);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("p0c_plan_a_day_key_invalid");
  }
  if (!immutablePlan || typeof immutablePlan !== "object") {
    throw new Error("p0c_plan_a_immutable_plan_required");
  }
  if (!Array.isArray(canonicalFixtureIds) && !(canonicalFixtureIds instanceof Set)) {
    throw new Error("p0c_plan_a_canonical_universe_required");
  }

  const sourceBefore = stableCanonicalJson(immutablePlan);
  const entries = rows.map((pick, pickIndex) => {
    const sourceFixtureId = fixtureIdOf(pick);
    if (!sourceFixtureId) {
      throw new Error(
        `p0c_plan_a_pick_fixture_id_required:${pickIndex}`,
      );
    }
    const resolution = overlay.resolveEvidenceFixtureMembership({
      repositoryFixtureId: sourceFixtureId,
      canonicalFixtureIds,
      allowUnmanaged: true,
    });
    if (!resolution.ok) {
      throw new Error(
        `p0c_plan_a_pick_identity_resolution_failed:${pickIndex}:${resolution.status}`,
      );
    }
    return {
      pickIndex,
      market: clean(pick.market || pick.pick || pick.selection) || null,
      sourceFixtureId,
      resolvedFixtureId: resolution.resolvedFixtureId,
      sourceFixtureRole: resolution.sourceRole,
      managed: resolution.managed,
      changed:
        sourceFixtureId !== resolution.resolvedFixtureId,
      sourcePickSha256: sha256CanonicalValue(pick),
      sourceEvidenceRewritten: false,
      pickTruthChanged: false,
    };
  });

  const sourceAfter = stableCanonicalJson(immutablePlan);
  if (sourceAfter !== sourceBefore) {
    throw new Error("p0c_plan_a_source_plan_mutated");
  }

  return {
    schema: P0C_PLAN_A_IDENTITY_OVERLAY_SCHEMA,
    dayKey: date,
    source: {
      path:
        clean(sourcePath) ||
        `data/value-plans/${date}/plan-a.json`,
      canonicalSha256: sha256CanonicalValue(immutablePlan),
      immutable: true,
      rewritten: false,
    },
    output: {
      relativePath: planAIdentityOverlayRelativePath(date),
      version: 1,
      additiveOnly: true,
    },
    pickCount: rows.length,
    changedFixtureIdCount:
      entries.filter(entry => entry.changed).length,
    entries,
    invariants: {
      sourcePlanByteRewriteAuthorized: false,
      sourcePlanSemanticRewriteAuthorized: false,
      pickMarketChanged: false,
      pickSettlementChanged: false,
      scoreTruthChanged: false,
      statusTruthChanged: false,
      fixtureMembershipCreated: false,
    },
    authorization: {
      immutablePlanOverwriteAuthorized: false,
      overlayArtifactWriteAuthorized: true,
      repositoryApplicationAuthorized: false,
    },
  };
}

export function writePlanAIdentityOverlay({
  artifact,
  outputPath,
  replace = false,
} = {}) {
  if (artifact?.schema !== P0C_PLAN_A_IDENTITY_OVERLAY_SCHEMA) {
    throw new Error("p0c_plan_a_overlay_artifact_invalid");
  }
  const target = path.resolve(clean(outputPath));
  if (!clean(outputPath)) {
    throw new Error("p0c_plan_a_overlay_output_path_required");
  }
  if (fs.existsSync(target) && !replace) {
    throw new Error("p0c_plan_a_overlay_output_exists");
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(
    temp,
    `${JSON.stringify(artifact, null, 2)}\n`,
    "utf8",
  );
  if (replace) fs.rmSync(target, { force: true });
  fs.renameSync(temp, target);
  return {
    ok: true,
    outputPath: target,
    pickCount: artifact.pickCount,
    immutablePlanOverwriteAuthorized: false,
    repositoryApplicationAuthorized: false,
  };
}
