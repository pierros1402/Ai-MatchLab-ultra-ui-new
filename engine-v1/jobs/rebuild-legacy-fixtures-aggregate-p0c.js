import fs from "node:fs";
import path from "node:path";
import {
  createProductionEvidenceIdentityOverlay,
} from "../core/production-evidence-identity-overlay.js";
import {
  buildFixturesAllFromCanonicalEvidenceDay,
} from "./rebuild-fixtures-all-from-canonical-evidence-day.js";

export const P0C_LEGACY_FIXTURES_REBUILD_SCHEMA =
  "ai-matchlab.p0c-legacy-fixtures-rebuild.v1";

function clean(value) {
  return String(value ?? "").trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fixtureRows(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.fixtures)) {
    return value.fixtures;
  }
  return [];
}

function dayKeyOf(row = {}) {
  const candidate = clean(
    row.dayKey ||
    row.date ||
    row.kickoffUtc ||
    row.kickoff,
  );
  const match = candidate.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

export function buildLegacyFixturesAggregateP0C({
  existingAggregate,
  canonicalByDay,
  overlay = createProductionEvidenceIdentityOverlay(),
} = {}) {
  const existingRows = fixtureRows(existingAggregate);
  if (!existingRows.length) {
    throw new Error("p0c_legacy_fixtures_existing_rows_required");
  }
  if (!canonicalByDay || typeof canonicalByDay !== "object") {
    throw new Error("p0c_legacy_fixtures_canonical_by_day_required");
  }

  const existingByDay = new Map();
  for (const row of existingRows) {
    const dayKey = dayKeyOf(row);
    if (!dayKey) {
      throw new Error("p0c_legacy_fixtures_existing_day_key_required");
    }
    const rows = existingByDay.get(dayKey) || [];
    rows.push(clone(row));
    existingByDay.set(dayKey, rows);
  }

  const operationalDayKeys = [...existingByDay.keys()].sort();
  const fixtures = [];
  const perDay = [];

  for (const dayKey of operationalDayKeys) {
    const canonicalRows = canonicalByDay[dayKey];
    if (!Array.isArray(canonicalRows)) {
      throw new Error(
        `p0c_legacy_fixtures_missing_canonical_day:${dayKey}`,
      );
    }
    const dayArtifact =
      buildFixturesAllFromCanonicalEvidenceDay({
        dayKey,
        canonicalRows,
        providerEvidenceRows: existingByDay.get(dayKey),
        overlay,
      });
    fixtures.push(...dayArtifact.matches);
    perDay.push({
      dayKey,
      existingRows: existingByDay.get(dayKey).length,
      rebuiltRows: dayArtifact.matches.length,
      providerEvidenceSkipped:
        dayArtifact.diagnostics.providerEvidenceSkipped,
    });
  }

  fixtures.sort((a, b) => {
    const day = dayKeyOf(a).localeCompare(dayKeyOf(b));
    if (day !== 0) return day;
    const kickoff = clean(a.kickoffUtc || a.kickoff)
      .localeCompare(clean(b.kickoffUtc || b.kickoff));
    if (kickoff !== 0) return kickoff;
    return clean(a.canonicalId || a.matchId || a.id)
      .localeCompare(clean(b.canonicalId || b.matchId || b.id));
  });

  return {
    schema: P0C_LEGACY_FIXTURES_REBUILD_SCHEMA,
    fixtures,
    rebuild: {
      operationalDayKeys,
      operationalDayCount: operationalDayKeys.length,
      inputRows: existingRows.length,
      outputRows: fixtures.length,
      perDay,
      newOperationalDayCreated: false,
      runtimeOnlyMembershipCreated: false,
      wallClockTimestampUsed: false,
      networkUsed: false,
      sourceEvidenceRewritten: false,
    },
    authorization: {
      backupArtifactApplicationAuthorized: false,
      lockArtifactApplicationAuthorized: false,
      repositoryApplicationAuthorized: false,
    },
  };
}

export function writeLegacyFixturesAggregate({
  artifact,
  outputPath,
  replace = false,
} = {}) {
  if (
    artifact?.schema !== P0C_LEGACY_FIXTURES_REBUILD_SCHEMA ||
    !Array.isArray(artifact.fixtures)
  ) {
    throw new Error("p0c_legacy_fixtures_artifact_invalid");
  }
  const target = path.resolve(clean(outputPath));
  if (!clean(outputPath)) {
    throw new Error("p0c_legacy_fixtures_output_path_required");
  }
  if (fs.existsSync(target) && !replace) {
    throw new Error("p0c_legacy_fixtures_output_exists");
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
    fixtureCount: artifact.fixtures.length,
    backupWritten: false,
    repositoryApplicationAuthorized: false,
  };
}
