import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { LEAGUES_COVERAGE } from "../../workers/_shared/leagues-coverage.js";
import { leagueName } from "../../workers/_shared/leagues-registry.js";

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    date: null,
    uefaReport: null,
    review: null,
    snapshotRef: null,
    output: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if ((arg === "--date" || arg === "--day") && argv[i + 1]) {
      out.date = String(argv[++i]).trim();
      continue;
    }

    if ((arg === "--uefa-report" || arg === "--report") && argv[i + 1]) {
      out.uefaReport = String(argv[++i]).trim();
      continue;
    }

    if (arg === "--review" && argv[i + 1]) {
      out.review = String(argv[++i]).trim();
      continue;
    }

    if ((arg === "--snapshot-ref" || arg === "--git-ref") && argv[i + 1]) {
      out.snapshotRef = String(argv[++i]).trim();
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      out.output = String(argv[++i]).trim();
      continue;
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(out.date || ""))) {
    throw new Error("--date YYYY-MM-DD is required");
  }

  if (!out.uefaReport) {
    throw new Error("--uefa-report path is required");
  }

  if (!out.output) {
    out.output = path.join(
      "data",
      "football-truth",
      "_diagnostics",
      "fixture-acquisition-stability",
      `${out.date}.fixture-active-gap-acquisition-priority.json`
    );
  }

  return out;
}

function readJson(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing JSON file: ${file}`);
  }

  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;

  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return { __readError: error?.message || String(error) };
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function clean(value) {
  return String(value || "").trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function gitShowJson(ref, repoPath) {
  if (!ref) return null;

  try {
    const text = execFileSync("git", ["show", `${ref}:${repoPath.replaceAll("\\", "/")}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });

    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getSlug(row) {
  return clean(
    row?.leagueSlug ||
    row?.league ||
    row?.leagueId ||
    row?.league_slug ||
    row?.competitionSlug ||
    row?.competition?.slug ||
    row?.meta?.leagueSlug
  );
}

function getMatchId(row) {
  return clean(
    row?.matchId ||
    row?.id ||
    row?.fixtureId ||
    row?.eventId ||
    row?.canonicalId ||
    row?.uid
  );
}

function collectFixtureRows(payload) {
  if (!payload) return [];

  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.fixtures)) return payload.fixtures;
  if (Array.isArray(payload.matches)) return payload.matches;
  if (Array.isArray(payload.events)) return payload.events;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.items)) return payload.items;

  if (payload.fixtures && typeof payload.fixtures === "object") {
    return Object.values(payload.fixtures).flatMap((value) => collectFixtureRows(value));
  }

  return [];
}

function rowsForSlug(payload, leagueSlug) {
  return collectFixtureRows(payload).filter((row) => getSlug(row) === leagueSlug);
}

function uniqueMatchIds(rows) {
  const ids = rows.map(getMatchId).filter(Boolean);
  return [...new Set(ids)];
}

function coverageBySlug() {
  const map = new Map();

  for (const row of asArray(LEAGUES_COVERAGE)) {
    const slug = clean(row?.slug);
    if (!slug) continue;
    map.set(slug, row);
  }

  return map;
}

function reviewBySlug(review) {
  const map = new Map();

  for (const row of asArray(review?.reviewItems)) {
    const slug = clean(row?.leagueSlug);
    if (!slug) continue;

    map.set(slug, {
      reviewId: clean(row.reviewId),
      dayKey: clean(row.dayKey),
      priority: clean(row.priority),
      targetType: clean(row.targetType),
      sourceVerdict: clean(row.reviewFields?.sourceVerdict || "unreviewed"),
      externallyActive: row.reviewFields?.externallyActive ?? null,
      fixtureCountFound: row.reviewFields?.fixtureCountFound ?? null,
      missingFromSnapshot: row.reviewFields?.missingFromSnapshot ?? null,
      sourceUrls: asArray(row.reviewFields?.sourceUrls).map(clean).filter(Boolean),
      sourceTypes: asArray(row.reviewFields?.sourceTypes).map(clean).filter(Boolean),
      reviewerNotes: clean(row.reviewFields?.reviewerNotes)
    });
  }

  return map;
}

function readCanonicalForSlug(date, leagueSlug) {
  const file = path.join("data", "canonical-fixtures", date, `${leagueSlug}.json`);
  const payload = readJsonIfExists(file);
  const rows = rowsForSlug(payload, leagueSlug);

  return {
    path: file,
    exists: !!payload && !payload.__readError,
    readError: payload?.__readError || null,
    fixtureCount: rows.length,
    matchIds: uniqueMatchIds(rows).slice(0, 20)
  };
}

function readSnapshot(date, snapshotRef) {
  const localPath = path.join("data", "deploy-snapshots", date, "fixtures.json");
  const localPayload = readJsonIfExists(localPath);

  if (localPayload && !localPayload.__readError) {
    return {
      source: "local_deploy_snapshot",
      path: localPath,
      exists: true,
      payload: localPayload,
      readError: null
    };
  }

  const refPayload = gitShowJson(snapshotRef, `data/deploy-snapshots/${date}/fixtures.json`);
  if (refPayload) {
    return {
      source: `git_ref:${snapshotRef}`,
      path: `data/deploy-snapshots/${date}/fixtures.json`,
      exists: true,
      payload: refPayload,
      readError: null
    };
  }

  return {
    source: snapshotRef ? `missing_local_and_git_ref:${snapshotRef}` : "missing_local",
    path: localPath,
    exists: false,
    payload: null,
    readError: localPayload?.__readError || null
  };
}

function inferFailureStage({ isInCoverage, canonical, snapshot, snapshotFixtureCount, expectedExternalFixtureCount }) {
  if (!isInCoverage) return "coverage_registry_missing";
  if (canonical.readError) return "canonical_read_error";
  if (snapshot.readError) return "snapshot_read_error";

  if (canonical.fixtureCount < 1) {
    return "canonical_acquisition_missing";
  }

  if (!snapshot.exists) {
    return "deploy_snapshot_missing_for_date";
  }

  if (snapshotFixtureCount < 1) {
    return "snapshot_export_or_filter_missing";
  }

  if (Number.isFinite(expectedExternalFixtureCount) && snapshotFixtureCount < expectedExternalFixtureCount) {
    return "partial_snapshot_fixture_gap";
  }

  return "no_gap_detected_in_available_local_or_ref_data";
}

function priorityForStage(stage) {
  if (stage === "coverage_registry_missing") return "P0";
  if (stage === "canonical_acquisition_missing") return "P0";
  if (stage === "deploy_snapshot_missing_for_date") return "P0";
  if (stage === "snapshot_export_or_filter_missing") return "P1";
  if (stage === "partial_snapshot_fixture_gap") return "P1";
  if (stage.endsWith("_read_error")) return "P1";
  return "P3";
}

function actionForStage(stage) {
  if (stage === "coverage_registry_missing") return "add_or_fix_league_coverage_registry";
  if (stage === "canonical_acquisition_missing") return "fix_fixture_acquisition_chunk/provider_path_for_verified_active_league";
  if (stage === "deploy_snapshot_missing_for_date") return "export_or_restore_deploy_snapshot_after_canonical_gap_is_resolved";
  if (stage === "snapshot_export_or_filter_missing") return "inspect_export_deploy_snapshot_day_filters_and_canonical_sync";
  if (stage === "partial_snapshot_fixture_gap") return "compare_external_evidence_to_canonical_and_snapshot_fixture_identity";
  if (stage.endsWith("_read_error")) return "fix_diagnostic_input_read_error";
  return "no_immediate_acquisition_action";
}

function buildReport(options) {
  const coverage = coverageBySlug();
  const uefaReport = readJson(options.uefaReport);
  const review = options.review ? readJson(options.review) : null;
  const reviewMap = reviewBySlug(review);
  const snapshot = readSnapshot(options.date, options.snapshotRef);

  const gaps = asArray(uefaReport.todayFirstDivisionSnapshotGaps);
  const rows = gaps.map((gap) => {
    const leagueSlug = clean(gap.leagueSlug);
    const reviewRow = reviewMap.get(leagueSlug) || null;
    const coverageRow = coverage.get(leagueSlug) || null;
    const canonical = readCanonicalForSlug(options.date, leagueSlug);
    const snapshotRows = rowsForSlug(snapshot.payload, leagueSlug);
    const snapshotFixtureCount = snapshotRows.length;
    const expectedExternalFixtureCount = Number(gap.fixtureCountFound ?? reviewRow?.fixtureCountFound ?? 0);

    const likelyFailureStage = inferFailureStage({
      isInCoverage: !!coverageRow,
      canonical,
      snapshot,
      snapshotFixtureCount,
      expectedExternalFixtureCount
    });

    return {
      leagueSlug,
      name: clean(gap.name) || leagueName(leagueSlug),
      code: clean(gap.code),
      country: clean(gap.country),
      sourceVerdict: clean(gap.sourceVerdict || reviewRow?.sourceVerdict),
      externallyActive: reviewRow?.externallyActive ?? true,
      expectedExternalFixtureCount,
      isInCoverage: !!coverageRow,
      coverage: coverageRow ? {
        slug: clean(coverageRow.slug),
        region: clean(coverageRow.region),
        type: clean(coverageRow.type),
        tier: coverageRow.tier ?? null,
        provider: clean(coverageRow.provider),
        providerLeagueId: coverageRow.providerLeagueId ?? coverageRow.id ?? null
      } : null,
      canonical: {
        exists: canonical.exists,
        path: canonical.path,
        fixtureCount: canonical.fixtureCount,
        matchIds: canonical.matchIds,
        readError: canonical.readError
      },
      deploySnapshot: {
        source: snapshot.source,
        exists: snapshot.exists,
        path: snapshot.path,
        fixtureCount: snapshotFixtureCount,
        matchIds: uniqueMatchIds(snapshotRows).slice(0, 20),
        readError: snapshot.readError
      },
      review: reviewRow,
      likelyFailureStage,
      priority: priorityForStage(likelyFailureStage),
      recommendedNextAction: actionForStage(likelyFailureStage)
    };
  });

  const byStage = {};
  const byPriority = {};
  for (const row of rows) {
    byStage[row.likelyFailureStage] = (byStage[row.likelyFailureStage] || 0) + 1;
    byPriority[row.priority] = (byPriority[row.priority] || 0) + 1;
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    schema: "ai-matchlab.fixture-active-gap-acquisition-priority.v1",
    date: options.date,
    source: {
      uefaReport: options.uefaReport,
      reviewPack: options.review || null,
      snapshotRef: options.snapshotRef || null
    },
    guarantees: {
      sourceFetch: false,
      canonicalWrites: 0,
      deploySnapshotWrites: false,
      valueWrites: false,
      detailsWrites: false,
      productionWrite: false
    },
    summary: {
      inputGapCount: gaps.length,
      analyzedGapCount: rows.length,
      inCoverageCount: rows.filter((row) => row.isInCoverage).length,
      canonicalPresentCount: rows.filter((row) => row.canonical.fixtureCount > 0).length,
      canonicalMissingCount: rows.filter((row) => row.canonical.fixtureCount < 1).length,
      snapshotPresentCount: rows.filter((row) => row.deploySnapshot.fixtureCount > 0).length,
      snapshotMissingCount: rows.filter((row) => row.deploySnapshot.fixtureCount < 1).length,
      byStage,
      byPriority
    },
    priorityRows: rows.slice().sort((a, b) => {
      const rank = { P0: 0, P1: 1, P2: 2, P3: 3 };
      return (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9) || a.leagueSlug.localeCompare(b.leagueSlug);
    })
  };
}

function main() {
  const options = parseArgs();
  const report = buildReport(options);
  writeJson(options.output, report);

  console.log(JSON.stringify({
    ok: report.ok,
    output: options.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();