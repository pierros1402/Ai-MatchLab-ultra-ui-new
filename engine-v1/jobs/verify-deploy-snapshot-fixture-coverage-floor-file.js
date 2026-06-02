#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = String(argv[i] || "");
    if (!token.startsWith("--")) {
      if (!args.date) args.date = token;
      continue;
    }

    const eq = token.indexOf("=");
    if (eq !== -1) {
      args[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || String(next).startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    i += 1;
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function unwrapRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.fixtures)) return payload.fixtures;
  if (Array.isArray(payload?.matches)) return payload.matches;
  if (Array.isArray(payload?.events)) return payload.events;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function cleanString(value) {
  return String(value || "").trim();
}

function finiteNonNegativeNumber(...values) {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue) && numberValue >= 0) {
      return numberValue;
    }
  }
  return null;
}

function leagueSlugFromRow(row) {
  return cleanString(row.leagueSlug || row.league || row.competitionSlug || row.competition?.slug || row.leagueId);
}

export function countDistinctLeagues(rows) {
  const leagues = new Set();
  for (const row of rows) {
    const slug = leagueSlugFromRow(row);
    if (slug) leagues.add(slug);
  }
  return leagues.size;
}

export function verifySnapshotCoverageFloor(options = {}) {
  const repoRoot = options.repoRoot || path.resolve(__dirname, "..", "..");
  const date = cleanString(options.date);
  if (!date) throw new Error("--date is required");

  const minFixtures = Number(options.minFixtures ?? 20);
  const minLeagues = Number(options.minLeagues ?? 5);
  const useManifestMinTargets = options.useManifestMinTargets === true || options.useManifestMinTargets === "true";
  if (!Number.isFinite(minFixtures) || minFixtures < 0) {
    throw new Error("--min-fixtures must be a non-negative number");
  }
  if (!Number.isFinite(minLeagues) || minLeagues < 0) {
    throw new Error("--min-leagues must be a non-negative number");
  }

  const snapshotDir = options.snapshotDir
    ? path.resolve(options.snapshotDir)
    : path.join(repoRoot, "data", "deploy-snapshots", date);

  const manifestFile = options.manifest
    ? path.resolve(options.manifest)
    : path.join(snapshotDir, "manifest.json");

  const fixturesFile = options.fixtures
    ? path.resolve(options.fixtures)
    : path.join(snapshotDir, "fixtures.json");

  if (!fs.existsSync(manifestFile)) {
    throw new Error(`missing manifest: ${manifestFile}`);
  }
  if (!fs.existsSync(fixturesFile)) {
    throw new Error(`missing fixtures: ${fixturesFile}`);
  }

  const manifest = readJson(manifestFile);
  const fixturePayload = readJson(fixturesFile);
  const rows = unwrapRows(fixturePayload);

  const fixtureCount = rows.length;
  const leagueCount = countDistinctLeagues(rows);
  const manifestFixtureCount = Number(manifest?.counts?.fixtures ?? manifest?.fixtureCount ?? NaN);
  const manifestDate = cleanString(manifest?.date);
  const manifestMinTargetFixtures = finiteNonNegativeNumber(
    manifest?.minTargetFixtures,
    manifest?.coverage?.minTargetFixtures,
    manifest?.coverageFloor?.minTargetFixtures,
    manifest?.counts?.minTargetFixtures,
    manifest?.quality?.minTargetFixtures
  );
  const manifestMinTargetLeagues = finiteNonNegativeNumber(
    manifest?.minTargetLeagues,
    manifest?.coverage?.minTargetLeagues,
    manifest?.coverageFloor?.minTargetLeagues,
    manifest?.counts?.minTargetLeagues,
    manifest?.quality?.minTargetLeagues
  );

  const effectiveMinFixtures = useManifestMinTargets && manifestMinTargetFixtures !== null
    ? Math.min(minFixtures, manifestMinTargetFixtures)
    : minFixtures;
  const effectiveMinLeagues = useManifestMinTargets && manifestMinTargetLeagues !== null
    ? Math.min(minLeagues, manifestMinTargetLeagues)
    : (useManifestMinTargets && manifestMinTargetFixtures !== null && manifestMinTargetFixtures < minFixtures
      ? Math.min(minLeagues, 1)
      : minLeagues);
  const effectiveMinFixtureSource = effectiveMinFixtures !== minFixtures ? "manifest_min_target" : "static_floor";
  const effectiveMinLeagueSource = effectiveMinLeagues !== minLeagues
    ? (manifestMinTargetLeagues !== null ? "manifest_min_target" : "sparse_manifest_fixture_target")
    : "static_floor";

  const failures = [];
  if (manifestDate && manifestDate !== date) {
    failures.push(`manifest_date_mismatch:${manifestDate}`);
  }
  if (Number.isFinite(manifestFixtureCount) && manifestFixtureCount !== fixtureCount) {
    failures.push(`manifest_fixture_count_mismatch:${manifestFixtureCount}_vs_${fixtureCount}`);
  }
  if (fixtureCount < effectiveMinFixtures) {
    failures.push(`fixture_count_below_floor:${fixtureCount}<${effectiveMinFixtures}`);
  }
  if (leagueCount < effectiveMinLeagues) {
    failures.push(`league_count_below_floor:${leagueCount}<${effectiveMinLeagues}`);
  }

  return {
    ok: failures.length === 0,
    mode: "verify_deploy_snapshot_fixture_coverage_floor",
    date,
    snapshotDir,
    manifestFile,
    fixturesFile,
    summary: {
      fixtureCount,
      leagueCount,
      minFixtures,
      minLeagues,
      effectiveMinFixtures,
      effectiveMinLeagues,
      effectiveMinFixtureSource,
      effectiveMinLeagueSource,
      useManifestMinTargets,
      manifestFixtureCount: Number.isFinite(manifestFixtureCount) ? manifestFixtureCount : null,
      manifestMinTargetFixtures,
      manifestMinTargetLeagues,
      failures
    },
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      deploySnapshotWrites: false,
      valueWrites: false,
      detailsWrites: false,
      productionWrite: false,
      dryRun: true
    }
  };
}

function writeOutput(report, output) {
  if (!output) return;
  const outputFile = path.resolve(output);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function writeFixturePayload(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ fixtures: rows }, null, 2)}\n`, "utf8");
}

function runSelfTest(output) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-snapshot-floor-self-test-"));
  const date = "2026-05-28";
  const snapshotDir = path.join(tmpRoot, "data", "deploy-snapshots", date);
  fs.mkdirSync(snapshotDir, { recursive: true });

  const goodRows = [];
  for (let league = 1; league <= 5; league += 1) {
    for (let match = 1; match <= 4; match += 1) {
      goodRows.push({
        id: `${league}-${match}`,
        leagueSlug: `test.${league}`,
        homeTeam: `Home ${league}-${match}`,
        awayTeam: `Away ${league}-${match}`
      });
    }
  }

  fs.writeFileSync(
    path.join(snapshotDir, "manifest.json"),
    `${JSON.stringify({ date, counts: { fixtures: goodRows.length } }, null, 2)}\n`,
    "utf8"
  );
  writeFixturePayload(path.join(snapshotDir, "fixtures.json"), goodRows);

  const good = verifySnapshotCoverageFloor({
    repoRoot: tmpRoot,
    date,
    minFixtures: 20,
    minLeagues: 5
  });

  const badRows = goodRows.slice(0, 6).map((row) => ({ ...row, leagueSlug: "test.1" }));
  writeFixturePayload(path.join(snapshotDir, "fixtures.json"), badRows);
  fs.writeFileSync(
    path.join(snapshotDir, "manifest.json"),
    `${JSON.stringify({ date, counts: { fixtures: badRows.length } }, null, 2)}\n`,
    "utf8"
  );

  const bad = verifySnapshotCoverageFloor({
    repoRoot: tmpRoot,
    date,
    minFixtures: 20,
    minLeagues: 5
  });


  const sparseRows = [
    { id: "sparse-1", leagueSlug: "sparse.1", homeTeam: "Sparse A", awayTeam: "Sparse B" },
    { id: "sparse-2", leagueSlug: "sparse.1", homeTeam: "Sparse C", awayTeam: "Sparse D" },
    { id: "sparse-3", leagueSlug: "sparse.2", homeTeam: "Sparse E", awayTeam: "Sparse F" },
    { id: "sparse-4", leagueSlug: "sparse.2", homeTeam: "Sparse G", awayTeam: "Sparse H" },
    { id: "sparse-5", leagueSlug: "sparse.2", homeTeam: "Sparse I", awayTeam: "Sparse J" }
  ];
  writeFixturePayload(path.join(snapshotDir, "fixtures.json"), sparseRows);
  fs.writeFileSync(
    path.join(snapshotDir, "manifest.json"),
    `${JSON.stringify({ date, counts: { fixtures: sparseRows.length }, minTargetFixtures: 4, minTargetFixtureSource: "canonical_coverage" }, null, 2)}\n`,
    "utf8"
  );

  const sparseStatic = verifySnapshotCoverageFloor({
    repoRoot: tmpRoot,
    date,
    minFixtures: 20,
    minLeagues: 5
  });

  const sparseContextAware = verifySnapshotCoverageFloor({
    repoRoot: tmpRoot,
    date,
    minFixtures: 20,
    minLeagues: 5,
    useManifestMinTargets: true
  });
  const report = {
    ok: good.ok === true && bad.ok === false && sparseStatic.ok === false && sparseContextAware.ok === true,
    selfTest: "verify-deploy-snapshot-fixture-coverage-floor",
    good: good.summary,
    bad: bad.summary,
    sparseStatic: sparseStatic.summary,
    sparseContextAware: sparseContextAware.summary,
    guarantees: good.guarantees
  };

  if (!report.ok) {
    throw new Error(`self-test failed: ${JSON.stringify(report, null, 2)}`);
  }

  writeOutput(report, output);
  console.log(JSON.stringify(report, null, 2));
}

function main() {
  const args = parseArgs(process.argv);

  if (args["self-test"]) {
    runSelfTest(args.output);
    return;
  }

  const report = verifySnapshotCoverageFloor({
    date: args.date,
    snapshotDir: args["snapshot-dir"],
    manifest: args.manifest,
    fixtures: args.fixtures,
    minFixtures: args["min-fixtures"],
    minLeagues: args["min-leagues"],
    useManifestMinTargets: args["use-manifest-min-targets"]
  });

  writeOutput(report, args.output);
  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && path.resolve(__filename) === invokedPath) {
  main();
}
