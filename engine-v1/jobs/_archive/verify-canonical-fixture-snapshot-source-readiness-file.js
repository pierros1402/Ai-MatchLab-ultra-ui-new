#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFile), '../..');
const dataRoot = path.join(repoRoot, 'data');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function repoRelative(filePath) {
  return path.relative(repoRoot, path.resolve(filePath)).replaceAll(path.sep, '/');
}

function isDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
}

function intArg(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer argument: ${value}`);
  }
  return parsed;
}

function unwrapFixtureRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.fixtures)) return payload.fixtures;
  if (Array.isArray(payload?.matches)) return payload.matches;
  if (Array.isArray(payload?.events)) return payload.events;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (payload?.fixture && typeof payload.fixture === 'object') return [payload.fixture];
  if (payload?.match && typeof payload.match === 'object') return [payload.match];
  if (payload && typeof payload === 'object' && (payload.matchId || payload.id || payload.matchKey)) return [payload];
  return [];
}

function countFixturesJsonDay(dayKey) {
  const fixturesFile = path.join(dataRoot, 'fixtures.json');
  const payload = readJsonSafe(fixturesFile, { fixtures: [] });
  const rows = Array.isArray(payload?.fixtures)
    ? payload.fixtures
    : Array.isArray(payload)
      ? payload
      : [];

  return rows.filter((row) => clean(row?.dayKey) === dayKey).length;
}

function readCanonicalDay(dayKey) {
  const dir = path.join(dataRoot, 'canonical-fixtures', dayKey);

  if (!fs.existsSync(dir)) {
    return {
      dir,
      exists: false,
      fileCount: 0,
      rawRows: 0,
      acceptedRows: 0,
      skippedRows: 0,
      byFile: []
    };
  }

  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => String(a).localeCompare(String(b)));

  const byFile = [];
  let rawRows = 0;
  let acceptedRows = 0;
  let skippedRows = 0;

  for (const file of files) {
    const payload = readJsonSafe(file, null);
    const rows = unwrapFixtureRows(payload);
    let accepted = 0;
    let skipped = 0;

    for (const row of rows) {
      rawRows += 1;
      const matchId = clean(row?.matchId || row?.id || row?.eventId || row?.matchKey);
      if (!matchId) {
        skipped += 1;
        skippedRows += 1;
        continue;
      }

      accepted += 1;
      acceptedRows += 1;
    }

    byFile.push({
      file: repoRelative(file).replace(/^data\//, ''),
      name: path.basename(file),
      leagueSlug: clean(payload?.leagueSlug || path.basename(file, '.json')),
      rows: rows.length,
      accepted,
      skipped
    });
  }

  return {
    dir,
    exists: true,
    fileCount: files.length,
    rawRows,
    acceptedRows,
    skippedRows,
    byFile
  };
}

function fail(errors, code, message, context = {}) {
  errors.push({ code, message, context });
}

function buildReport(options) {
  const errors = [];
  const warnings = [];
  const dayKey = clean(options.dayKey);

  if (!isDayKey(dayKey)) {
    fail(errors, 'invalid_day_key', 'dayKey must be YYYY-MM-DD.', { dayKey });
  }

  const expectedPromotedSlugs = asArray(options.expectedPromotedSlugs).map(clean).filter(Boolean);
  const expectedPromotedFixtures = options.expectedPromotedFixtures;
  const expectedCanonicalFiles = options.expectedCanonicalFiles;
  const expectedCanonicalFixtures = options.expectedCanonicalFixtures;
  const requireCanonicalSnapshotSource = options.requireCanonicalSnapshotSource === true;

  const fixturesJsonDayCount = isDayKey(dayKey) ? countFixturesJsonDay(dayKey) : 0;
  const canonical = isDayKey(dayKey)
    ? readCanonicalDay(dayKey)
    : { exists: false, fileCount: 0, rawRows: 0, acceptedRows: 0, skippedRows: 0, byFile: [] };

  if (!canonical.exists) {
    fail(errors, 'missing_canonical_day_dir', 'Canonical fixture date directory does not exist.', { dayKey });
  }

  const promotedRows = [];
  let promotedFixtureCount = 0;

  for (const slug of expectedPromotedSlugs) {
    const expectedFile = `canonical-fixtures/${dayKey}/${slug}.json`;
    const hit = canonical.byFile.find((row) => row.file === expectedFile);

    if (!hit) {
      fail(errors, 'missing_expected_promoted_file', 'Expected promoted canonical fixture file is missing.', {
        dayKey,
        leagueSlug: slug,
        expectedFile
      });
      continue;
    }

    promotedFixtureCount += Number(hit.accepted || 0);
    promotedRows.push(hit);
  }

  const expectedSnapshotFixtureSource = canonical.acceptedRows > fixturesJsonDayCount
    ? 'canonical_fixtures'
    : 'fixtures_json';

  if (
    expectedPromotedFixtures != null &&
    promotedFixtureCount !== expectedPromotedFixtures
  ) {
    fail(errors, 'unexpected_promoted_fixture_count', 'Promoted fixture count does not match expectation.', {
      expected: expectedPromotedFixtures,
      actual: promotedFixtureCount
    });
  }

  if (
    expectedCanonicalFiles != null &&
    canonical.fileCount !== expectedCanonicalFiles
  ) {
    fail(errors, 'unexpected_canonical_file_count', 'Canonical file count does not match expectation.', {
      expected: expectedCanonicalFiles,
      actual: canonical.fileCount
    });
  }

  if (
    expectedCanonicalFixtures != null &&
    canonical.acceptedRows !== expectedCanonicalFixtures
  ) {
    fail(errors, 'unexpected_canonical_fixture_count', 'Canonical accepted row count does not match expectation.', {
      expected: expectedCanonicalFixtures,
      actual: canonical.acceptedRows
    });
  }

  if (canonical.skippedRows !== 0) {
    fail(errors, 'canonical_rows_skipped', 'Canonical fixture rows were skipped because they lacked match identity.', {
      skippedRows: canonical.skippedRows
    });
  }

  if (
    requireCanonicalSnapshotSource &&
    expectedSnapshotFixtureSource !== 'canonical_fixtures'
  ) {
    fail(errors, 'snapshot_source_would_not_be_canonical', 'Snapshot export would not choose canonical_fixtures based on current counts.', {
      fixturesJsonDayCount,
      canonicalAcceptedRows: canonical.acceptedRows,
      expectedSnapshotFixtureSource
    });
  }

  return {
    ok: errors.length === 0,
    job: 'verify-canonical-fixture-snapshot-source-readiness-file',
    generatedAt: new Date().toISOString(),
    mode: 'read_only_canonical_fixture_snapshot_source_readiness',
    sourceInput: {
      dayKey,
      expectedPromotedSlugs,
      expectedPromotedFixtures,
      expectedCanonicalFiles,
      expectedCanonicalFixtures,
      requireCanonicalSnapshotSource
    },
    summary: {
      dayKey,
      fixturesJsonDayCount,
      canonicalFileCount: canonical.fileCount,
      canonicalRawRows: canonical.rawRows,
      canonicalAcceptedRows: canonical.acceptedRows,
      canonicalSkippedRows: canonical.skippedRows,
      expectedPromotedLeagueCount: expectedPromotedSlugs.length,
      promotedCanonicalLeagueCount: promotedRows.length,
      promotedCanonicalFixtureCount: promotedFixtureCount,
      expectedSnapshotFixtureSource,
      errorCount: errors.length,
      warningCount: warnings.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      fetch: false,
      sourceFetch: false,
      urlFetch: false,
      noFetch: true,
      noUrlFetch: true,
      canonicalWrites: 0,
      deploySnapshotWrites: 0,
      valueWrites: 0,
      detailsWrites: 0,
      finalResultWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    promotedFiles: promotedRows,
    canonicalFiles: canonical.byFile,
    errors,
    warnings
  };
}

function runSelfTest() {
  const report = {
    ok: true,
    selfTest: 'verify-canonical-fixture-snapshot-source-readiness-file',
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
  console.log(JSON.stringify(report, null, 2));
}

function main() {
  const args = parseArgs(process.argv);

  if (args['self-test']) {
    runSelfTest();
    return;
  }

  const dayKey = clean(args.date || args.dayKey);
  const output = clean(args.output);
  const expectedPromotedSlugs = clean(args.expectedPromotedSlugs)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!dayKey) {
    throw new Error('--date is required');
  }

  const report = buildReport({
    dayKey,
    expectedPromotedSlugs,
    expectedPromotedFixtures: intArg(args.expectedPromotedFixtures, null),
    expectedCanonicalFiles: intArg(args.expectedCanonicalFiles, null),
    expectedCanonicalFixtures: intArg(args.expectedCanonicalFixtures, null),
    requireCanonicalSnapshotSource: args.requireCanonicalSnapshotSource === true
  });

  if (output) {
    writeJson(path.resolve(output), report);
  }

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main();