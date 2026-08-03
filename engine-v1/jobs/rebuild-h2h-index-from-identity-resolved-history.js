import fs from "node:fs";
import path from "node:path";
import {
  canonicalH2HPairIdentity,
} from "../core/h2h-canonical-key-policy.js";
import {
  createProductionEvidenceIdentityOverlay,
} from "../core/production-evidence-identity-overlay.js";

export const P0C_H2H_REBUILD_SCHEMA =
  "ai-matchlab.p0c-h2h-rebuild.v1";

function clean(value) {
  return String(value ?? "").trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function score(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0
    ? parsed
    : null;
}

function firstScore(row, fields) {
  for (const field of fields) {
    const value = score(row?.[field]);
    if (value !== null) return value;
  }
  return null;
}

function dayOf(row, fallback = null) {
  const candidate = clean(
    row?.dayKey ||
    row?.date ||
    row?.kickoffUtc ||
    row?.kickoff ||
    fallback,
  );
  const match = candidate.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function rowsFromHistoryDocuments(historyDocuments = []) {
  const rows = [];
  for (const document of historyDocuments) {
    if (!document || typeof document !== "object") continue;

    if (Array.isArray(document.rows)) {
      for (const row of document.rows) {
        rows.push({ row, fallbackDay: document.dayKey || null });
      }
    }

    for (const day of Array.isArray(document.days)
      ? document.days
      : []) {
      for (const row of Array.isArray(day?.rows)
        ? day.rows
        : []) {
        rows.push({ row, fallbackDay: day.dayKey || null });
      }
    }
  }
  return rows;
}

function sourceMatchId(row, fallbackDay) {
  return clean(
    row?.canonicalId ||
    row?.matchId ||
    row?.id ||
    row?.fixtureId ||
    `${fallbackDay || "unknown"}_${row?.homeTeam || row?.home || "home"}_${row?.awayTeam || row?.away || "away"}`,
  );
}

function comparableMatch(match) {
  return JSON.stringify({
    matchId: match.matchId,
    date: match.date,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    scoreHome: match.scoreHome,
    scoreAway: match.scoreAway,
    competition: match.competition,
    leagueSlug: match.leagueSlug,
  });
}

export function buildH2HArtifactsFromHistory({
  historyDocuments,
  overlay = createProductionEvidenceIdentityOverlay(),
  maxMatches = 20,
} = {}) {
  if (!Array.isArray(historyDocuments)) {
    throw new Error("p0c_h2h_history_documents_required");
  }
  if (!Number.isInteger(maxMatches) || maxMatches < 1) {
    throw new Error("p0c_h2h_max_matches_invalid");
  }

  const pairMap = new Map();
  const stats = {
    sourceRows: 0,
    eligibleRows: 0,
    skippedWithoutScore: 0,
    skippedWithoutTeams: 0,
    suppressedAliasesResolved: 0,
    duplicateRows: 0,
  };

  for (const { row, fallbackDay } of rowsFromHistoryDocuments(
    historyDocuments,
  )) {
    stats.sourceRows++;
    if (!row || typeof row !== "object") continue;

    const scoreHome = firstScore(row, [
      "scoreHome",
      "homeScore",
    ]);
    const scoreAway = firstScore(row, [
      "scoreAway",
      "awayScore",
    ]);
    if (scoreHome === null || scoreAway === null) {
      stats.skippedWithoutScore++;
      continue;
    }

    const fixtureId = sourceMatchId(row, fallbackDay);
    const normalizedRow = {
      ...clone(row),
      canonicalId: fixtureId,
      matchId: fixtureId,
    };
    const overlaid = overlay.overlayEvidenceMatchRow(normalizedRow);
    if (!overlaid.ok) {
      throw new Error(
        `p0c_h2h_identity_overlay_failed:${overlaid.status}`,
      );
    }

    const homeTeam = clean(
      overlaid.homeResolution.preferredDisplayName,
    );
    const awayTeam = clean(
      overlaid.awayResolution.preferredDisplayName,
    );
    if (!homeTeam || !awayTeam) {
      stats.skippedWithoutTeams++;
      continue;
    }

    const pair = canonicalH2HPairIdentity(
      homeTeam,
      awayTeam,
      { resolveCanonical: value => value },
    );
    if (!pair.valid || !pair.key) {
      throw new Error(
        `p0c_h2h_pair_identity_invalid:${pair.reasonCode || "unknown"}`,
      );
    }

    const date = dayOf(row, fallbackDay);
    const match = {
      matchId:
        overlaid.fixtureResolution.resolvedFixtureId,
      date,
      homeTeam,
      awayTeam,
      scoreHome,
      scoreAway,
      competition:
        clean(row.leagueName || row.competition) || null,
      leagueSlug: clean(row.leagueSlug) || null,
      productionIdentityBinding:
        overlaid.binding,
    };

    if (
      overlaid.fixtureResolution.sourceRole ===
      "suppressed_lineage_alias"
    ) {
      stats.suppressedAliasesResolved++;
    }

    let state = pairMap.get(pair.key);
    if (!state) {
      state = {
        key: pair.key,
        teamA: pair.teamA,
        teamB: pair.teamB,
        byMatchId: new Map(),
      };
      pairMap.set(pair.key, state);
    }

    const prior = state.byMatchId.get(match.matchId);
    if (prior) {
      if (comparableMatch(prior) !== comparableMatch(match)) {
        throw new Error(
          `p0c_h2h_duplicate_truth_conflict:${match.matchId}`,
        );
      }
      stats.duplicateRows++;
      continue;
    }

    state.byMatchId.set(match.matchId, match);
    stats.eligibleRows++;
  }

  const artifacts = [...pairMap.values()]
    .map(state => {
      const matches = [...state.byMatchId.values()]
        .sort((a, b) => {
          const dateOrder = clean(b.date).localeCompare(
            clean(a.date),
          );
          if (dateOrder !== 0) return dateOrder;
          return clean(a.matchId).localeCompare(
            clean(b.matchId),
          );
        })
        .slice(0, maxMatches);
      const newestDate = matches[0]?.date || null;
      return {
        relativePath: `${state.key}.json`,
        key: state.key,
        payload: {
          teamA: state.teamA,
          teamB: state.teamB,
          matches,
          updatedAt: newestDate
            ? `${newestDate}T00:00:00.000Z`
            : null,
          rebuild: {
            schema: P0C_H2H_REBUILD_SCHEMA,
            deterministic: true,
            wallClockTimestampUsed: false,
            sourceEvidenceRewritten: false,
          },
        },
      };
    })
    .sort((a, b) =>
      a.relativePath.localeCompare(b.relativePath),
    );

  return {
    schema: P0C_H2H_REBUILD_SCHEMA,
    ok: true,
    status: "PASS_H2H_ARTIFACTS_BUILT_IN_MEMORY",
    artifactCount: artifacts.length,
    artifacts,
    stats,
    authorization: {
      repositoryApplicationAuthorized: false,
      historyRewriteAuthorized: false,
      sourceEvidenceRewriteAuthorized: false,
    },
  };
}

export function materializeH2HArtifacts({
  build,
  outputRoot,
  replace = false,
} = {}) {
  if (!build?.ok || !Array.isArray(build.artifacts)) {
    throw new Error("p0c_h2h_build_required");
  }
  const root = path.resolve(clean(outputRoot));
  if (!clean(outputRoot)) {
    throw new Error("p0c_h2h_output_root_required");
  }

  if (fs.existsSync(root) && !replace) {
    throw new Error("p0c_h2h_output_root_exists");
  }

  const parent = path.dirname(root);
  fs.mkdirSync(parent, { recursive: true });
  const tempRoot = path.join(
    parent,
    `.${path.basename(root)}.tmp-${process.pid}`,
  );
  fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });

  for (const artifact of build.artifacts) {
    const target = path.resolve(tempRoot, artifact.relativePath);
    if (!target.startsWith(`${tempRoot}${path.sep}`)) {
      throw new Error("p0c_h2h_output_path_escape");
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      `${JSON.stringify(artifact.payload, null, 2)}\n`,
      "utf8",
    );
  }

  if (replace) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  fs.renameSync(tempRoot, root);

  return {
    ok: true,
    status: "PASS_H2H_ARTIFACTS_MATERIALIZED",
    outputRoot: root,
    artifactCount: build.artifacts.length,
    repositoryApplicationAuthorized: false,
  };
}
