import fs from "node:fs";
import path from "node:path";
import {
  createProductionEvidenceIdentityOverlay,
} from "../core/production-evidence-identity-overlay.js";

export const P0C_FIXTURES_ALL_REBUILD_SCHEMA =
  "ai-matchlab.p0c-fixtures-all-rebuild.v1";

const PROTECTED_FIELDS = new Set([
  "canonicalId",
  "matchId",
  "id",
  "fixtureId",
  "repositoryFixtureId",
  "dayKey",
  "date",
  "leagueSlug",
  "leagueName",
  "competition",
  "home",
  "away",
  "homeTeam",
  "awayTeam",
  "homeName",
  "awayName",
  "kickoffUtc",
  "kickoff",
  "status",
  "statusType",
  "rawStatus",
  "operationalState",
  "scoreHome",
  "scoreAway",
  "homeScore",
  "awayScore",
  "productionIdentityBinding",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function firstId(row = {}) {
  return clean(
    row.canonicalId ||
    row.matchId ||
    row.id ||
    row.fixtureId ||
    row.repositoryFixtureId,
  );
}

function truthSignature(row = {}) {
  return JSON.stringify({
    dayKey: clean(row.dayKey || row.date),
    leagueSlug: clean(row.leagueSlug),
    home: clean(row.homeTeam || row.home || row.homeName),
    away: clean(row.awayTeam || row.away || row.awayName),
    kickoffUtc: clean(row.kickoffUtc || row.kickoff),
    status: clean(
      row.status ||
      row.statusType ||
      row.rawStatus ||
      row.operationalState,
    ),
    scoreHome: row.scoreHome ?? row.homeScore ?? null,
    scoreAway: row.scoreAway ?? row.awayScore ?? null,
  });
}

function sourceRoleRank(role) {
  if (role === "retained") return 0;
  if (role === "unmanaged") return 1;
  if (role === "suppressed_lineage_alias") return 2;
  return 3;
}

function providerRank(candidate, resolvedId) {
  const exact = candidate.sourceId === resolvedId ? 0 : 1;
  return [
    sourceRoleRank(candidate.resolution.sourceRole),
    exact,
    candidate.sourceId,
  ];
}

function compareRank(a, b, resolvedId) {
  const left = providerRank(a, resolvedId);
  const right = providerRank(b, resolvedId);
  for (let index = 0; index < left.length; index++) {
    const order = String(left[index]).localeCompare(
      String(right[index]),
      undefined,
      { numeric: true },
    );
    if (order !== 0) return order;
  }
  return 0;
}

function mergeProviderWithCanonical(provider, canonical) {
  const merged = clone(provider || {});
  for (const [key, value] of Object.entries(canonical)) {
    if (
      PROTECTED_FIELDS.has(key) ||
      merged[key] === undefined ||
      merged[key] === null ||
      merged[key] === ""
    ) {
      merged[key] = clone(value);
    }
  }
  for (const key of PROTECTED_FIELDS) {
    if (Object.hasOwn(canonical, key)) {
      merged[key] = clone(canonical[key]);
    }
  }
  return merged;
}

function normalizeCanonicalRows({
  canonicalRows,
  overlay,
  dayKey,
}) {
  const byResolvedId = new Map();

  for (const sourceRow of canonicalRows) {
    const sourceId = firstId(sourceRow);
    if (!sourceId) {
      throw new Error("p0c_fixtures_all_canonical_id_required");
    }
    const row = {
      ...clone(sourceRow),
      canonicalId: sourceId,
      matchId: sourceId,
      dayKey: clean(sourceRow.dayKey || dayKey),
    };
    const result = overlay.overlayEvidenceMatchRow(row);
    if (!result.ok) {
      throw new Error(
        `p0c_fixtures_all_canonical_overlay_failed:${result.status}`,
      );
    }

    const resolvedId = result.fixtureResolution.resolvedFixtureId;
    const candidate = {
      sourceId,
      sourceRole: result.fixtureResolution.sourceRole,
      view: result.view,
      signature: truthSignature(result.view),
    };
    const prior = byResolvedId.get(resolvedId);
    if (!prior) {
      byResolvedId.set(resolvedId, candidate);
      continue;
    }

    if (prior.signature !== candidate.signature) {
      throw new Error(
        `p0c_fixtures_all_canonical_truth_conflict:${resolvedId}`,
      );
    }

    if (
      sourceRoleRank(candidate.sourceRole) <
      sourceRoleRank(prior.sourceRole)
    ) {
      byResolvedId.set(resolvedId, candidate);
    }
  }

  return byResolvedId;
}

function indexProviderEvidence({
  providerEvidenceRows,
  overlay,
  canonicalFixtureIds,
}) {
  const byResolvedId = new Map();
  const skipped = [];

  for (const sourceRow of providerEvidenceRows) {
    const sourceId = firstId(sourceRow);
    if (!sourceId) {
      skipped.push({ reason: "FIXTURE_ID_REQUIRED" });
      continue;
    }
    const row = {
      ...clone(sourceRow),
      canonicalId: sourceId,
      matchId: sourceId,
    };
    const result = overlay.overlayEvidenceMatchRow(row, {
      canonicalFixtureIds,
      requireMembership: true,
    });
    if (!result.ok) {
      skipped.push({
        sourceId,
        reason: result.status,
      });
      continue;
    }
    const resolvedId = result.fixtureResolution.resolvedFixtureId;
    const candidates = byResolvedId.get(resolvedId) || [];
    candidates.push({
      sourceId,
      resolution: result.fixtureResolution,
      view: result.view,
    });
    byResolvedId.set(resolvedId, candidates);
  }

  for (const [resolvedId, candidates] of byResolvedId) {
    candidates.sort((a, b) => compareRank(a, b, resolvedId));
  }

  return { byResolvedId, skipped };
}

export function buildFixturesAllFromCanonicalEvidenceDay({
  dayKey,
  canonicalRows,
  providerEvidenceRows = [],
  overlay = createProductionEvidenceIdentityOverlay(),
} = {}) {
  const date = clean(dayKey);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("p0c_fixtures_all_day_key_invalid");
  }
  if (!Array.isArray(canonicalRows)) {
    throw new Error("p0c_fixtures_all_canonical_rows_required");
  }
  if (!Array.isArray(providerEvidenceRows)) {
    throw new Error("p0c_fixtures_all_provider_rows_invalid");
  }

  const canonical = normalizeCanonicalRows({
    canonicalRows,
    overlay,
    dayKey: date,
  });
  const canonicalFixtureIds = new Set(canonical.keys());
  const provider = indexProviderEvidence({
    providerEvidenceRows,
    overlay,
    canonicalFixtureIds,
  });

  const matches = [...canonical.entries()]
    .map(([resolvedId, canonicalCandidate]) => {
      const providerCandidates =
        provider.byResolvedId.get(resolvedId) || [];
      const selectedProvider = providerCandidates[0] || null;
      const merged = mergeProviderWithCanonical(
        selectedProvider?.view || {},
        canonicalCandidate.view,
      );
      merged.canonicalId = resolvedId;
      merged.matchId = resolvedId;
      merged.id = resolvedId;
      merged.dayKey = date;
      merged.productionIdentityBinding = {
        ...canonicalCandidate.view.productionIdentityBinding,
        providerEvidenceSourceFixtureIds:
          providerCandidates.map(item => item.sourceId),
        providerEvidenceSelectedSourceFixtureId:
          selectedProvider?.sourceId || null,
        fixtureMembershipCreated: false,
        sourceEvidenceRewritten: false,
      };
      return merged;
    })
    .sort((a, b) => {
      const kickoff = clean(a.kickoffUtc || a.kickoff)
        .localeCompare(clean(b.kickoffUtc || b.kickoff));
      if (kickoff !== 0) return kickoff;
      return clean(a.canonicalId).localeCompare(
        clean(b.canonicalId),
      );
    });

  return {
    schema: P0C_FIXTURES_ALL_REBUILD_SCHEMA,
    dayKey: date,
    source: "offline-canonical-evidence",
    matchCount: matches.length,
    matches,
    diagnostics: {
      canonicalInputRows: canonicalRows.length,
      retainedMembershipRows: matches.length,
      providerEvidenceRows: providerEvidenceRows.length,
      providerEvidenceMatched:
        [...provider.byResolvedId.values()]
          .reduce((sum, rows) => sum + rows.length, 0),
      providerEvidenceSkipped: provider.skipped.length,
      providerSkipReasons: provider.skipped,
      fixtureMembershipCreated: 0,
      networkUsed: false,
      wallClockTimestampUsed: false,
    },
    authorization: {
      canonicalRegistryWriteAuthorized: false,
      providerEvidenceRewriteAuthorized: false,
      repositoryApplicationAuthorized: false,
    },
  };
}

export function writeFixturesAllArtifact({
  artifact,
  outputPath,
  replace = false,
} = {}) {
  if (
    artifact?.schema !== P0C_FIXTURES_ALL_REBUILD_SCHEMA ||
    !Array.isArray(artifact.matches)
  ) {
    throw new Error("p0c_fixtures_all_artifact_invalid");
  }
  const target = path.resolve(clean(outputPath));
  if (!clean(outputPath)) {
    throw new Error("p0c_fixtures_all_output_path_required");
  }
  if (fs.existsSync(target) && !replace) {
    throw new Error("p0c_fixtures_all_output_exists");
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
    matchCount: artifact.matches.length,
    repositoryApplicationAuthorized: false,
  };
}
