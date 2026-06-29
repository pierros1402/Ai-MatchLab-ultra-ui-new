import fs from "fs";
import path from "path";
import crypto from "crypto";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    return fallback;
  }
}

function writeJsonStable(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function sha256Json(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

function bytesOfFile(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
  } catch {
    return 0;
  }
}

function mb(bytes) {
  return Number((Number(bytes || 0) / 1024 / 1024).toFixed(2));
}

function normalizeMatchId(value) {
  return String(value ?? "").trim();
}

function dayFixtures(fixturesPayload, dayKey) {
  const fixtures = Array.isArray(fixturesPayload?.fixtures)
    ? fixturesPayload.fixtures
    : Array.isArray(fixturesPayload)
      ? fixturesPayload
      : [];

  return fixtures
    .filter(row => String(row?.dayKey || "") === String(dayKey))
    .sort((a, b) => String(a?.kickoffUtc || "").localeCompare(String(b?.kickoffUtc || "")));
}

function canonicalFixturesForDay(dayKey) {
  const dir = resolveDataPath("canonical-fixtures", dayKey);
  const rows = [];
  const seen = new Set();

  if (!fs.existsSync(dir)) {
    return rows;
  }

  for (const file of fs.readdirSync(dir).filter(name => name.endsWith(".json")).sort()) {
    const payload = readJsonSafe(path.join(dir, file), null);
    const fixtures = Array.isArray(payload?.fixtures) ? payload.fixtures : [];

    for (const fixture of fixtures) {
      const matchId = normalizeMatchId(
        fixture?.matchId ||
        fixture?.sourceMatchId ||
        fixture?.sourceId ||
        fixture?.matchKey ||
        fixture?.id
      );

      if (!matchId || seen.has(matchId)) {
        continue;
      }

      seen.add(matchId);
      rows.push({
        ...fixture,
        matchId
      });
    }
  }

  return rows.sort((a, b) => {
    const ka = String(a?.kickoffUtc || a?.date || a?.startTime || "");
    const kb = String(b?.kickoffUtc || b?.date || b?.startTime || "");
    if (ka !== kb) return ka.localeCompare(kb);
    return String(a?.matchId || "").localeCompare(String(b?.matchId || ""));
  });
}

function fixturesForSnapshotDay(dayKey) {
  const fixturesPayload = readJsonSafe(resolveDataPath("fixtures.json"), { fixtures: [] });
  const fixturesFromMain = dayFixtures(fixturesPayload, dayKey);
  const fixturesFromCanonical = canonicalFixturesForDay(dayKey);
  const canonicalFixtureCount = fixturesFromCanonical.length;
  const fixtureJsonCount = fixturesFromMain.length;

  if (fixturesFromCanonical.length > fixturesFromMain.length) {
    return {
      source: "canonical_fixtures",
      canonicalFixtureCount,
      fixtureJsonCount,
      fixtures: fixturesFromCanonical
    };
  }

  return {
    source: "fixtures_json",
    canonicalFixtureCount,
    fixtureJsonCount,
    fixtures: fixturesFromMain
  };
}

function resolveManifestTargetFixtureGate(fixturesSnapshot) {
  const staticMinTargetFixtures = Number(process.env.DAILY_INGEST_MIN_TARGET_FIXTURES || 45);
  const normalizedStaticMinTargetFixtures = Number.isFinite(staticMinTargetFixtures) && staticMinTargetFixtures > 0
    ? staticMinTargetFixtures
    : 45;
  const canonicalFixtures = Number(fixturesSnapshot?.canonicalFixtureCount || 0);

  if (canonicalFixtures > 0) {
    const canonicalFloor = Math.max(1, Math.floor(canonicalFixtures * 0.95));

    return {
      staticMinTargetFixtures: normalizedStaticMinTargetFixtures,
      minTargetFixtures: Math.min(normalizedStaticMinTargetFixtures, canonicalFloor),
      minTargetFixtureSource: "canonical_coverage",
      canonicalCoverageFixtureCount: canonicalFixtures
    };
  }

  return {
    staticMinTargetFixtures: normalizedStaticMinTargetFixtures,
    minTargetFixtures: normalizedStaticMinTargetFixtures,
    minTargetFixtureSource: "static",
    canonicalCoverageFixtureCount: null
  };
}

function valueForDay(dayKey, options = {}) {
  const file = resolveDataPath("value", `${dayKey}.json`);
  const payload = readJsonSafe(file, null);

  const snapshotValueFile = options?.snapshotRoot
    ? path.join(options.snapshotRoot, "value.json")
    : null;
  const snapshotPayload = options?.preserveValue === true && snapshotValueFile
    ? readJsonSafe(snapshotValueFile, null)
    : null;
  const snapshotHasPicks = Array.isArray(snapshotPayload?.picks) && snapshotPayload.picks.length > 0;

  if (!payload || typeof payload !== "object") {
    if (snapshotHasPicks) {
      return {
        ...snapshotPayload,
        source: snapshotPayload?.source || "preserved_snapshot_value"
      };
    }

    return {
      ok: true,
      date: dayKey,
      count: 0,
      picks: [],
      source: "missing_local_value_file"
    };
  }

  const payloadHasPicks = Array.isArray(payload?.picks) && payload.picks.length > 0;
  if (options?.preserveValue === true && !payloadHasPicks && snapshotHasPicks) {
    return {
      ...snapshotPayload,
      source: snapshotPayload?.source || "preserved_snapshot_value"
    };
  }

  return payload;
}

function detailFilesForDay(dayKey) {
  const dir = resolveDataPath("details", dayKey);

  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(name => name.endsWith(".json"))
    .sort()
    .map(name => path.join(dir, name));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function extractPlayerUsageSides(detail) {
  const direct = detail?.playerUsageIntel;
  const facts = detail?.researchedFacts?.playerUsageIntel;

  return {
    home: direct?.home || facts?.home || null,
    away: direct?.away || facts?.away || null
  };
}

function extractTeamNews(detail) {
  return (
    detail?.teamNewsIntel ||
    detail?.researchedFacts?.teamNewsIntel ||
    detail?.teamNews ||
    detail?.researchedFacts?.teamNews ||
    detail?.context?.teamNews ||
    detail?.aiTasks?.team_news ||
    null
  );
}

function numericConfidence(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }

  return 0;
}

function statusText(...values) {
  for (const value of values) {
    const s = String(value || "").trim().toLowerCase();
    if (s) return s;
  }

  return "";
}

function countTeamNewsContent(node) {
  if (!node || typeof node !== "object") return 0;

  return (
    asArray(node.absences).length +
    asArray(node.injuries).length +
    asArray(node.suspensions).length +
    asArray(node.notes).length +
    asArray(node.evidence).length +
    asArray(node.sources).length +
    asArray(node.items).length +
    asArray(node.players).length
  );
}

function isUsableTeamNews(teamNews) {
  if (!teamNews || typeof teamNews !== "object") return false;

  const status = statusText(
    teamNews.status,
    teamNews.state,
    teamNews.data?.status,
    teamNews.data?.state
  );

  if (
    status === "empty" ||
    status === "missing" ||
    status === "unavailable" ||
    status === "placeholder" ||
    status === "stub" ||
    status === "no_data" ||
    status === "none"
  ) {
    return false;
  }

  const confidence = numericConfidence(
    teamNews.confidence,
    teamNews.data?.confidence,
    teamNews.home?.confidence,
    teamNews.away?.confidence,
    teamNews.data?.home?.confidence,
    teamNews.data?.away?.confidence
  );

  const contentNodes = [
    teamNews,
    teamNews.data,
    teamNews.home,
    teamNews.away,
    teamNews.data?.home,
    teamNews.data?.away,
    teamNews.teamNews,
    teamNews.data?.teamNews
  ];

  const contentCount = contentNodes.reduce((sum, node) => sum + countTeamNewsContent(node), 0);

  if (contentCount > 0) return true;

  return (
    confidence > 0 &&
    (
      status === "ready" ||
      status === "ok" ||
      status === "available" ||
      status === "complete" ||
      status === "structured" ||
      status === "validated"
    )
  );
}

function isUsablePlayerUsageSide(side) {
  if (!side || typeof side !== "object") return false;

  const status = String(side?.status || side?.readyStatus || side?.meta?.status || "").toLowerCase();

  if (
    status === "unavailable" ||
    status === "missing" ||
    status === "placeholder" ||
    status === "stub"
  ) {
    return false;
  }

  const confidence =
    Number.isFinite(Number(side?.confidence)) ? Number(side.confidence) :
    Number.isFinite(Number(side?.meta?.confidence)) ? Number(side.meta.confidence) :
    0;

  const sampleMatches =
    Number.isFinite(Number(side?.sampleMatches)) ? Number(side.sampleMatches) :
    Number.isFinite(Number(side?.sampleCount)) ? Number(side.sampleCount) :
    Number.isFinite(Number(side?.matchCount)) ? Number(side.matchCount) :
    Number.isFinite(Number(side?.meta?.sampleMatches)) ? Number(side.meta.sampleMatches) :
    Number.isFinite(Number(side?.meta?.sampleCount)) ? Number(side.meta.sampleCount) :
    0;

  const expectedStarters =
    asArray(side?.expectedStarters).length > 0 ? asArray(side.expectedStarters) :
    asArray(side?.coreStarters).length > 0 ? asArray(side.coreStarters) :
    asArray(side?.starters).length > 0 ? asArray(side.starters) :
    asArray(side?.players).filter(player =>
      player?.role === "starter" ||
      player?.expectedStarter === true ||
      player?.isStarter === true
    );

  return (
    confidence > 0 &&
    sampleMatches >= 1 &&
    expectedStarters.length >= 6
  );
}

function summarizeDetail(detail) {
  const canonicalId = detail?.basic?.canonicalId || null;
  const matchId = canonicalId || normalizeMatchId(detail?.matchId || detail?.basic?.matchId || detail?.fixture?.matchId);

  const hasTravel =
    Boolean(detail?.travelContext) ||
    Boolean(detail?.travel) ||
    Boolean(detail?.context?.travel) ||
    Boolean(detail?.researchedFacts?.travelContext) ||
    Boolean(detail?.aiTasks?.travel_context);

  const playerUsageSides = extractPlayerUsageSides(detail);
  const playerUsageUsableSides = [
    isUsablePlayerUsageSide(playerUsageSides.home),
    isUsablePlayerUsageSide(playerUsageSides.away)
  ].filter(Boolean).length;

  const hasPlayerUsage = playerUsageUsableSides > 0;

  const teamNews = extractTeamNews(detail);
  const hasTeamNews = isUsableTeamNews(teamNews);

  const valueRows = [
    ...(Array.isArray(detail?.value) ? detail.value : []),
    ...(Array.isArray(detail?.valuePicks) ? detail.valuePicks : []),
    ...(Array.isArray(detail?.valueSummary?.picks) ? detail.valueSummary.picks : [])
  ];

  // hasValue = true only when there are actual picks with real signal.
  // Presence of valueSummary/meta alone is NOT sufficient — those can exist
  // even when count=0, causing false-positive detailsWithValue in the manifest.
  const hasValue =
    valueRows.length > 0 ||
    (Array.isArray(detail?.value) && detail.value.length > 0) ||
    (Array.isArray(detail?.valuePicks) && detail.valuePicks.length > 0) ||
    (Number.isFinite(detail?.valueSummary?.count) && detail.valueSummary.count > 0);

  const valueHasMatchProfile = valueRows.some(row =>
    row?.matchProfileApplied === true ||
    row?.matchProfileApplied === "true" ||
    (Array.isArray(row?.signals) && row.signals.includes("match_profile_applied"))
  );

  const serializedValue = JSON.stringify({
    value: detail?.value,
    valuePicks: detail?.valuePicks,
    valueSummary: detail?.valueSummary,
    analysis: detail?.analysis
  });

  const matchProfileApplied =
    Boolean(detail?.meta?.matchProfileApplied) ||
    valueHasMatchProfile ||
    serializedValue.includes("match_profile_applied");

  const valueSynced =
    Boolean(detail?.meta?.valueSynced) ||
    hasValue;

  return {
    canonicalId,
    matchId,
    hasTravel,
    hasPlayerUsage,
    playerUsageUsableSides,
    hasTeamNews,
    hasValue,
    matchProfileApplied,
    valueSynced,
    keys: Object.keys(detail || {}).sort()
  };
}

function emptyDir(dir) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}

function copyDetails(dayKey, snapshotDetailsDir, options = {}) {
  const files = detailFilesForDay(dayKey);
  const summaries = [];
  let totalBytes = 0;
  let largest = { file: null, bytes: 0, mb: 0 };

  const preserveExistingDetails = options?.preserveDetails === true;

  ensureDir(snapshotDetailsDir);
  if (!preserveExistingDetails) {
    emptyDir(snapshotDetailsDir);
  }

  for (const src of files) {
    const detail = readJsonSafe(src, null);
    if (!detail || typeof detail !== "object") continue;

    // Prefer canonicalId for the filename — stable across provider changes.
    // Falls back to matchId for legacy detail files that predate canonical IDs.
    const matchId =
      detail?.basic?.canonicalId ||
      normalizeMatchId(detail?.matchId || detail?.basic?.matchId || detail?.fixture?.matchId) ||
      path.basename(src, ".json");

    const outFile = path.join(snapshotDetailsDir, `${matchId}.json`);

    /*
      Ξ£ΞΊΟΟ€ΞΉΞΌΞ± Ξ”Ξ•Ξ ΞΊΟΞ²ΞΏΟ…ΞΌΞµ UI sections.
      Ξ¤ΞΏ deploy snapshot ΞΊΟΞ±Ο„Ξ¬ Ο€Ξ»Ξ®ΟΞµΟ‚ detail payload Ξ³ΞΉΞ± Ξ½Ξ± Ξ±Ξ½ΞΏΞ―Ξ³ΞµΞΉ Ο„ΞΏ Details panel ΟƒΟ„ΞΏ Render ΟΟ€Ο‰Ο‚ Ο„ΞΏ local.
    */
    writeJsonStable(outFile, detail);

    const bytes = bytesOfFile(outFile);
    totalBytes += bytes;

    if (bytes > largest.bytes) {
      largest = {
        file: path.basename(outFile),
        bytes,
        mb: mb(bytes)
      };
    }

    summaries.push({
      file: path.basename(outFile),
      bytes,
      mb: mb(bytes),
      ...summarizeDetail(detail)
    });
  }

  if (options?.preserveDetails === true && fs.existsSync(snapshotDetailsDir)) {
    summaries.length = 0;
    totalBytes = 0;
    largest = { file: null, bytes: 0, mb: 0 };

    for (const name of fs.readdirSync(snapshotDetailsDir).filter(x => x.endsWith(".json")).sort()) {
      const detailFile = path.join(snapshotDetailsDir, name);
      const detail = readJsonSafe(detailFile, null);
      if (!detail || typeof detail !== "object") continue;

      const bytes = bytesOfFile(detailFile);
      totalBytes += bytes;

      if (bytes > largest.bytes) {
        largest = {
          file: name,
          bytes,
          mb: mb(bytes)
        };
      }

      summaries.push({
        file: name,
        bytes,
        mb: mb(bytes),
        ...summarizeDetail(detail)
      });
    }
  }
  return {
    count: summaries.length,
    totalBytes,
    totalMb: mb(totalBytes),
    largest,
    summaries
  };
}

export function exportDeploySnapshotDay(dayKey, options = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey || ""))) {
    throw new Error(`invalid dayKey: ${dayKey}`);
  }

  const startedAt = new Date().toISOString();

  const snapshotRoot = resolveDataPath("deploy-snapshots", dayKey);
  const snapshotDetailsDir = path.join(snapshotRoot, "details");

  ensureDir(snapshotRoot);
  ensureDir(snapshotDetailsDir);

  const fixturesSnapshot = fixturesForSnapshotDay(dayKey);
  const fixtures = fixturesSnapshot.fixtures;
  const fixturesSource = fixturesSnapshot.source;
  const targetFixtureGate = resolveManifestTargetFixtureGate(fixturesSnapshot);

  const value = valueForDay(dayKey, { snapshotRoot, preserveValue: options?.preserveValue === true });
  const detailsReport = copyDetails(dayKey, snapshotDetailsDir, { preserveDetails: options?.preserveDetails === true });

  const fixturesOut = {
    ok: true,
    date: dayKey,
    count: fixtures.length,
    fixtures
  };

  const valueOut = {
    ...value,
    ok: value?.ok !== false,
    date: dayKey,
    count: Array.isArray(value?.picks) ? value.picks.length : Number(value?.count || 0),
    picks: Array.isArray(value?.picks) ? value.picks : []
  };

  writeJsonStable(path.join(snapshotRoot, "fixtures.json"), fixturesOut);
  writeJsonStable(path.join(snapshotRoot, "value.json"), valueOut);

  const manifest = {
    ok: true,
    date: dayKey,
    generatedAt: new Date().toISOString(),
    startedAt,
    source: "local_canonical_export",
    version: "deploy-snapshot-v1",
    fixturesSource,
    fixtureJsonCount: fixturesSnapshot.fixtureJsonCount,
    canonicalFixtureCount: fixturesSnapshot.canonicalFixtureCount,
    canonicalCoverageFixtureCount: targetFixtureGate.canonicalCoverageFixtureCount,
    staticMinTargetFixtures: targetFixtureGate.staticMinTargetFixtures,
    minTargetFixtures: targetFixtureGate.minTargetFixtures,
    minTargetFixtureSource: targetFixtureGate.minTargetFixtureSource,
    files: {
      fixtures: "fixtures.json",
      value: "value.json",
      detailsDir: "details"
    },
    counts: {
      fixtures: fixturesOut.count,
      valuePicks: valueOut.count,
      details: detailsReport.count
    },
    coverage: {
      minTargetFixtures: targetFixtureGate.minTargetFixtures,
      minTargetFixtureSource: targetFixtureGate.minTargetFixtureSource,
      canonicalCoverageFixtureCount: targetFixtureGate.canonicalCoverageFixtureCount,
      detailsWithTravel: detailsReport.summaries.filter(x => x.hasTravel).length,
      detailsWithPlayerUsage: detailsReport.summaries.filter(x => x.hasPlayerUsage).length,
      playerUsageUsableSides: detailsReport.summaries.reduce((sum, x) => sum + Number(x.playerUsageUsableSides || 0), 0),
      playerUsageTotalSides: detailsReport.summaries.length * 2,
      detailsWithTeamNews: detailsReport.summaries.filter(x => x.hasTeamNews).length,
      detailsWithValue: detailsReport.summaries.filter(x => x.hasValue).length,
      matchProfileApplied: detailsReport.summaries.filter(x => x.matchProfileApplied).length
    },
    sizes: {
      fixturesMb: mb(bytesOfFile(path.join(snapshotRoot, "fixtures.json"))),
      valueMb: mb(bytesOfFile(path.join(snapshotRoot, "value.json"))),
      detailsTotalMb: detailsReport.totalMb,
      largestDetail: detailsReport.largest
    },
    details: detailsReport.summaries
  };

  manifest.hash = sha256Json({
    date: manifest.date,
    counts: manifest.counts,
    fixturesSource: manifest.fixturesSource,
    staticMinTargetFixtures: manifest.staticMinTargetFixtures,
    minTargetFixtures: manifest.minTargetFixtures,
    minTargetFixtureSource: manifest.minTargetFixtureSource,
    canonicalCoverageFixtureCount: manifest.canonicalCoverageFixtureCount,
    coverage: manifest.coverage,
    sizes: manifest.sizes,
    details: manifest.details.map(x => ({
      file: x.file,
      bytes: x.bytes,
      hasTravel: x.hasTravel,
      hasPlayerUsage: x.hasPlayerUsage,
      hasTeamNews: x.hasTeamNews,
      hasValue: x.hasValue
    }))
  });

  writeJsonStable(path.join(snapshotRoot, "manifest.json"), manifest);

  const latest = {
    ok: true,
    date: dayKey,
    generatedAt: manifest.generatedAt,
    manifest: `data/deploy-snapshots/${dayKey}/manifest.json`,
    fixtures: `data/deploy-snapshots/${dayKey}/fixtures.json`,
    value: `data/deploy-snapshots/${dayKey}/value.json`,
    detailsDir: `data/deploy-snapshots/${dayKey}/details`,
    hash: manifest.hash
  };

  const latestFile = resolveDataPath("deploy-snapshots", "latest.json");
  const updateLatest = options?.updateLatest !== false;

  if (updateLatest) {
    writeJsonStable(latestFile, latest);
  }

  return {
    ok: true,
    date: dayKey,
    snapshotRoot,
    manifestFile: path.join(snapshotRoot, "manifest.json"),
    latestFile,
    latestUpdated: updateLatest,
    counts: manifest.counts,
    coverage: manifest.coverage,
    sizes: manifest.sizes,
    hash: manifest.hash
  };
}

if (process.argv[1] && process.argv[1].endsWith("export-deploy-snapshot-day.js")) {
  const dayKey = String(process.argv[2] || "").trim();

  try {
    const result = exportDeploySnapshotDay(dayKey);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("[export-deploy-snapshot-day] fatal", err);
    process.exit(1);
  }
}
