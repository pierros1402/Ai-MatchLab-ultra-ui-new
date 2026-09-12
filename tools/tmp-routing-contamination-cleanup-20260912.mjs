import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const BASE_SHA = "4a7d448dfa827d392983764057423841b2b737fe";
const REPAIR_KEY = "2026-09-12";
const DAYS = ["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"];
const SLUGS = ["eng.1", "pol.2", "fifa.world"];
const SNAPSHOT_DAYS = ["2026-09-10", "2026-09-11", "2026-09-12"];
const QUARANTINE_ROOT = path.join(
  "data",
  "competition-routing-quarantine",
  REPAIR_KEY
);

const EXPECTED_BY_DAY = Object.freeze({
  "2026-09-10": 4,
  "2026-09-11": 12,
  "2026-09-12": 47,
  "2026-09-13": 6
});

const EXPECTED_BY_SLUG = Object.freeze({
  "eng.1": 44,
  "pol.2": 9,
  "fifa.world": 16
});

const EXPECTED_AFFECTED_FILES = Object.freeze({
  "2026-09-10/fifa.world": { total: 4, bad: 4, retained: 0 },
  "2026-09-11/eng.1": { total: 6, bad: 6, retained: 0 },
  "2026-09-11/pol.2": { total: 4, bad: 2, retained: 2 },
  "2026-09-11/fifa.world": { total: 4, bad: 4, retained: 0 },
  "2026-09-12/eng.1": { total: 43, bad: 36, retained: 7 },
  "2026-09-12/pol.2": { total: 10, bad: 7, retained: 3 },
  "2026-09-12/fifa.world": { total: 4, bad: 4, retained: 0 },
  "2026-09-13/eng.1": { total: 4, bad: 2, retained: 2 },
  "2026-09-13/fifa.world": { total: 4, bad: 4, retained: 0 }
});

const EXPECTED_SNAPSHOT_DETAIL_REMOVALS = Object.freeze({
  "2026-09-10": 4,
  "2026-09-11": 12,
  "2026-09-12": 47
});

const EXPECTED_SNAPSHOT_ODDS_REMOVALS = Object.freeze({
  "2026-09-10": 4,
  "2026-09-11": 4,
  "2026-09-12": 4
});

const EXPECTED_MULTI_ODDS_REMOVALS = Object.freeze({
  "2026-09-10": 1,
  "2026-09-11": 5,
  "2026-09-12": 35,
  "2026-09-13": 1
});

function fail(message, details = null) {
  if (details !== null) {
    console.error(JSON.stringify(details, null, 2));
  }
  throw new Error(message);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256File(file) {
  return sha256Buffer(fs.readFileSync(file));
}

function clean(value) {
  return String(value ?? "").trim();
}

function candidateId(row) {
  return clean(row?.canonicalId || row?.matchId);
}

function classify(slug, row) {
  const leagueName = clean(row?.leagueName);
  const teams = `${clean(row?.homeTeam || row?.home)} ${clean(row?.awayTeam || row?.away)}`;

  if (slug === "eng.1" && leagueName.toLowerCase() !== "premier league") {
    return `eng.1_wrong_competition:${leagueName || "missing_league_name"}`;
  }

  if (
    slug === "pol.2" &&
    !["division 1", "i liga"].includes(leagueName.toLowerCase())
  ) {
    return `pol.2_wrong_competition:${leagueName || "missing_league_name"}`;
  }

  if (slug === "fifa.world" && /\bu20\s*w\b/iu.test(teams)) {
    return "fifa.world_u20_women";
  }

  return null;
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = row[key];
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function assertExactCounts(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    fail(`${label}_mismatch`, { actual, expected });
  }
}

function contentHash(matches) {
  const stable = matches.map(m => ({
    matchId: m.matchId,
    canonicalId: m.canonicalId || null,
    leagueSlug: m.leagueSlug,
    competition: m.competition,
    home: m.home,
    away: m.away,
    dayKey: m.dayKey,
    kickoffUtc: m.kickoffUtc || m.kickoffLocal,
    market: m.market,
    aiAssessment: m.aiAssessment || null
  }));

  return crypto
    .createHash("sha1")
    .update(JSON.stringify(stable))
    .digest("hex");
}

function assessmentRowCount(matches) {
  return matches.filter(
    match =>
      match?.aiAssessment?.markets &&
      typeof match.aiAssessment.markets === "object" &&
      Object.keys(match.aiAssessment.markets).length > 0
  ).length;
}

const archiveRecords = [];
const archivedSources = new Set();

function archiveExact(sourcePath) {
  const normalized = sourcePath.replace(/\\/gu, "/");
  if (archivedSources.has(normalized)) return;
  if (!fs.existsSync(sourcePath)) {
    fail(`archive_source_missing:${normalized}`);
  }

  const destination = path.join(
    QUARANTINE_ROOT,
    "originals",
    ...normalized.split("/")
  );

  ensureDir(path.dirname(destination));
  fs.copyFileSync(sourcePath, destination);

  const sourceBuffer = fs.readFileSync(sourcePath);
  const destinationBuffer = fs.readFileSync(destination);
  const sourceHash = sha256Buffer(sourceBuffer);
  const destinationHash = sha256Buffer(destinationBuffer);

  if (
    sourceBuffer.length !== destinationBuffer.length ||
    sourceHash !== destinationHash
  ) {
    fail(`archive_copy_mismatch:${normalized}`);
  }

  archiveRecords.push({
    sourcePath: normalized,
    archivePath: destination.replace(/\\/gu, "/"),
    bytes: sourceBuffer.length,
    sha256: sourceHash
  });
  archivedSources.add(normalized);
}

const candidates = [];
const candidateFiles = [];

for (const day of DAYS) {
  for (const slug of SLUGS) {
    const file = path.join("data", "canonical-fixtures", day, `${slug}.json`);
    if (!fs.existsSync(file)) continue;

    const document = readJson(file);
    const fixtures = Array.isArray(document?.fixtures) ? document.fixtures : [];
    const badRows = [];

    for (const row of fixtures) {
      const reason = classify(slug, row);
      if (!reason) continue;
      const id = candidateId(row);
      if (!id) fail(`candidate_missing_identity:${day}:${slug}`);

      badRows.push(row);
      candidates.push({
        day,
        slug,
        canonicalId: id,
        sourceId: clean(row?.sourceId || row?.sourceMatchId),
        leagueName: row?.leagueName ?? null,
        homeTeam: row?.homeTeam ?? row?.home ?? null,
        awayTeam: row?.awayTeam ?? row?.away ?? null,
        kickoffUtc: row?.kickoffUtc ?? null,
        status: row?.status ?? row?.statusType ?? null,
        scoreHome: row?.scoreHome ?? row?.homeScore ?? null,
        scoreAway: row?.scoreAway ?? row?.awayScore ?? null,
        reason
      });
    }

    if (badRows.length > 0) {
      candidateFiles.push({
        day,
        slug,
        file,
        total: fixtures.length,
        bad: badRows.length,
        retained: fixtures.length - badRows.length
      });
    }
  }
}

candidates.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
candidateFiles.sort((a, b) => `${a.day}/${a.slug}`.localeCompare(`${b.day}/${b.slug}`));

if (candidates.length !== 69) {
  fail("candidate_count_mismatch", { actual: candidates.length, expected: 69 });
}

const candidateIds = candidates.map(row => row.canonicalId);
if (new Set(candidateIds).size !== candidateIds.length) {
  fail("candidate_ids_not_unique");
}

assertExactCounts(countBy(candidates, "day"), EXPECTED_BY_DAY, "candidate_by_day");
assertExactCounts(countBy(candidates, "slug"), EXPECTED_BY_SLUG, "candidate_by_slug");

const actualFileContract = Object.fromEntries(
  candidateFiles.map(row => [
    `${row.day}/${row.slug}`,
    { total: row.total, bad: row.bad, retained: row.retained }
  ])
);
assertExactCounts(actualFileContract, EXPECTED_AFFECTED_FILES, "candidate_file_contract");

const candidateSet = new Set(candidateIds);
const repairAt = new Date().toISOString();
const canonicalMutations = [];

for (const entry of candidateFiles) {
  const document = readJson(entry.file);
  const fixtures = Array.isArray(document?.fixtures) ? document.fixtures : [];
  const retained = fixtures.filter(row => !candidateSet.has(candidateId(row)));
  const removed = fixtures.filter(row => candidateSet.has(candidateId(row)));

  if (removed.length !== entry.bad || retained.length !== entry.retained) {
    fail(`canonical_filter_contract_failed:${entry.day}:${entry.slug}`);
  }

  archiveExact(entry.file);

  if (retained.length === 0) {
    fs.unlinkSync(entry.file);
    canonicalMutations.push({
      path: entry.file.replace(/\\/gu, "/"),
      action: "deleted_empty_contaminated_file",
      removed: removed.length,
      retained: 0
    });
    continue;
  }

  document.fixtures = retained;
  document.count = retained.length;
  if (Object.prototype.hasOwnProperty.call(document, "updatedAt")) {
    document.updatedAt = repairAt;
  }
  document.routingContaminationRepair = {
    repairedAt: repairAt,
    repairKey: REPAIR_KEY,
    removedRows: removed.length,
    policy: "strict_competition_identity"
  };
  writeJson(entry.file, document);

  canonicalMutations.push({
    path: entry.file.replace(/\\/gu, "/"),
    action: "filtered",
    removed: removed.length,
    retained: retained.length
  });
}

const finalResultRemovals = [];
for (const candidate of candidates) {
  const file = path.join(
    "data",
    "final-results",
    candidate.day,
    `${candidate.canonicalId}.json`
  );

  if (!fs.existsSync(file)) continue;
  archiveExact(file);
  finalResultRemovals.push({
    day: candidate.day,
    canonicalId: candidate.canonicalId,
    sourcePath: file.replace(/\\/gu, "/")
  });
  fs.unlinkSync(file);
}

if (finalResultRemovals.length !== 16) {
  fail("final_result_removal_count_mismatch", {
    actual: finalResultRemovals.length,
    expected: 16,
    finalResultRemovals
  });
}

const snapshotEvidence = [];
for (const day of SNAPSHOT_DAYS) {
  const snapshotRoot = path.join("data", "deploy-snapshots", day);
  const fixturesFile = path.join(snapshotRoot, "fixtures.json");
  const manifestFile = path.join(snapshotRoot, "manifest.json");
  if (!fs.existsSync(fixturesFile) || !fs.existsSync(manifestFile)) {
    fail(`snapshot_required_file_missing:${day}`);
  }

  archiveExact(fixturesFile);
  archiveExact(manifestFile);

  let detailArchives = 0;
  for (const candidate of candidates.filter(row => row.day === day)) {
    const detailFile = path.join(
      snapshotRoot,
      "details",
      `${candidate.canonicalId}.json`
    );
    if (!fs.existsSync(detailFile)) {
      fail(`expected_snapshot_detail_missing:${candidate.canonicalId}`);
    }
    archiveExact(detailFile);
    detailArchives += 1;
  }

  if (detailArchives !== EXPECTED_SNAPSHOT_DETAIL_REMOVALS[day]) {
    fail(`snapshot_detail_archive_count_mismatch:${day}`);
  }

  const oddsFile = path.join(snapshotRoot, "odds.json");
  let oddsRemoved = 0;
  if (fs.existsSync(oddsFile)) {
    const odds = readJson(oddsFile);
    const matches = Array.isArray(odds?.matches) ? odds.matches : [];
    const retainedMatches = [];
    const removedMatches = [];

    for (const match of matches) {
      const ids = [match?.canonicalId, match?.matchId]
        .map(clean)
        .filter(Boolean);
      const remove = ids.some(id => candidateSet.has(id));
      (remove ? removedMatches : retainedMatches).push(match);
    }

    oddsRemoved = removedMatches.length;
    if (oddsRemoved > 0) {
      archiveExact(oddsFile);
      odds.matches = retainedMatches;
      odds.count = retainedMatches.length;
      odds.assessmentRows = assessmentRowCount(retainedMatches);
      odds.hash = contentHash(retainedMatches);
      writeJson(oddsFile, odds);
    }
  }

  if (oddsRemoved !== EXPECTED_SNAPSHOT_ODDS_REMOVALS[day]) {
    fail(`snapshot_odds_removal_count_mismatch:${day}`, {
      actual: oddsRemoved,
      expected: EXPECTED_SNAPSHOT_ODDS_REMOVALS[day]
    });
  }

  snapshotEvidence.push({
    day,
    archivedCandidateDetails: detailArchives,
    oddsRowsRemoved: oddsRemoved
  });
}

const multiOddsMutations = [];
for (const day of DAYS) {
  const file = path.join("data", "multi-odds", `${day}.json`);
  if (!fs.existsSync(file)) {
    if (EXPECTED_MULTI_ODDS_REMOVALS[day] !== 0) {
      fail(`multi_odds_missing:${day}`);
    }
    continue;
  }

  const document = readJson(file);
  const matches =
    document?.matches && typeof document.matches === "object" && !Array.isArray(document.matches)
      ? document.matches
      : {};

  const retainedEntries = [];
  const removedEntries = [];
  for (const [key, value] of Object.entries(matches)) {
    const serialized = JSON.stringify(value);
    const remove =
      candidateSet.has(key) ||
      candidateIds.some(id => serialized.includes(id));
    (remove ? removedEntries : retainedEntries).push([key, value]);
  }

  const expected = EXPECTED_MULTI_ODDS_REMOVALS[day];
  if (removedEntries.length !== expected) {
    fail(`multi_odds_removal_count_mismatch:${day}`, {
      actual: removedEntries.length,
      expected,
      removedKeys: removedEntries.map(([key]) => key)
    });
  }

  if (removedEntries.length > 0) {
    archiveExact(file);
    document.matches = Object.fromEntries(retainedEntries);
    writeJson(file, document);
  }

  multiOddsMutations.push({
    day,
    removed: removedEntries.length,
    retained: retainedEntries.length
  });
}

const latestFile = path.join("data", "deploy-snapshots", "latest.json");
archiveExact(latestFile);

// Fail closed before any exporter runs: active canonical truth and active final
// results must already be free of the targeted misrouting candidates.
for (const day of DAYS) {
  for (const slug of SLUGS) {
    const file = path.join("data", "canonical-fixtures", day, `${slug}.json`);
    if (!fs.existsSync(file)) continue;
    const document = readJson(file);
    for (const row of Array.isArray(document?.fixtures) ? document.fixtures : []) {
      if (classify(slug, row)) {
        fail(`post_filter_canonical_candidate_remains:${day}:${slug}:${candidateId(row)}`);
      }
    }
  }
}

for (const removal of finalResultRemovals) {
  if (fs.existsSync(removal.sourcePath)) {
    fail(`active_final_result_remains:${removal.canonicalId}`);
  }
}

archiveRecords.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));

const quarantineManifest = {
  schema: "ai-matchlab.competition-routing-quarantine.v1",
  ok: true,
  repairKey: REPAIR_KEY,
  repairBaseSha: BASE_SHA,
  generatedAt: repairAt,
  policy: {
    mode: "strict_competition_identity_residual_cleanup",
    canonicalSourceOfTruth: true,
    valueObservationsRewritten: false,
    historicalResearchArtifactsRewritten: false,
    finalResultsActivePathPolicy:
      "archive_byte_exact_then_remove_from_active_truth_when_canonical_membership_is_invalid",
    rules: {
      "eng.1": "leagueName must equal Premier League",
      "pol.2": "leagueName must equal Division 1 or I Liga",
      "fifa.world": "U20 Women rows are not FIFA senior world fixtures"
    }
  },
  summary: {
    candidateCount: candidates.length,
    byDay: countBy(candidates, "day"),
    bySlug: countBy(candidates, "slug"),
    finalResultsArchivedAndRemoved: finalResultRemovals.length,
    archivedFileCount: archiveRecords.length
  },
  canonicalMutations,
  finalResultRemovals,
  snapshotEvidence,
  multiOddsMutations,
  candidates,
  archiveRecords
};

writeJson(path.join(QUARANTINE_ROOT, "manifest.json"), quarantineManifest);

// Verify every permanent forensic copy after the manifest itself is written.
for (const record of archiveRecords) {
  if (!fs.existsSync(record.archivePath)) {
    fail(`archive_missing_after_write:${record.archivePath}`);
  }
  if (sha256File(record.archivePath) !== record.sha256) {
    fail(`archive_hash_drift:${record.archivePath}`);
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      repairBaseSha: BASE_SHA,
      candidateCount: candidates.length,
      byDay: countBy(candidates, "day"),
      bySlug: countBy(candidates, "slug"),
      finalResultsArchivedAndRemoved: finalResultRemovals.length,
      snapshotEvidence,
      multiOddsMutations,
      archivedFileCount: archiveRecords.length,
      quarantineManifest:
        path.join(QUARANTINE_ROOT, "manifest.json").replace(/\\/gu, "/")
    },
    null,
    2
  )
);
