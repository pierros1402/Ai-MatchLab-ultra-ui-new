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

function valueForDay(dayKey) {
  const file = resolveDataPath("value", `${dayKey}.json`);
  const payload = readJsonSafe(file, null);

  if (!payload || typeof payload !== "object") {
    return {
      ok: true,
      date: dayKey,
      count: 0,
      picks: [],
      source: "missing_local_value_file"
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

function summarizeDetail(detail) {
  const matchId = normalizeMatchId(detail?.matchId || detail?.basic?.matchId || detail?.fixture?.matchId);

  const hasTravel =
    Boolean(detail?.travelContext) ||
    Boolean(detail?.travel) ||
    Boolean(detail?.context?.travel) ||
    Boolean(detail?.researchedFacts?.travelContext) ||
    Boolean(detail?.aiTasks?.travel_context);

  const hasPlayerUsage =
    Boolean(detail?.playerUsageIntel) ||
    Boolean(detail?.researchedFacts?.playerUsageIntel);

  const hasTeamNews =
    Boolean(detail?.teamNewsIntel) ||
    Boolean(detail?.researchedFacts?.teamNewsIntel) ||
    Boolean(detail?.teamNews);

  const valueRows = [
    ...(Array.isArray(detail?.value) ? detail.value : []),
    ...(Array.isArray(detail?.valuePicks) ? detail.valuePicks : []),
    ...(Array.isArray(detail?.valueSummary?.picks) ? detail.valueSummary.picks : [])
  ];

  const hasValue =
    valueRows.length > 0 ||
    Boolean(detail?.value) ||
    Boolean(detail?.valuePicks) ||
    Boolean(detail?.valueSummary) ||
    Boolean(detail?.meta?.valueSynced) ||
    Boolean(detail?.meta?.matchProfileApplied);

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
    matchId,
    hasTravel,
    hasPlayerUsage,
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

function copyDetails(dayKey, snapshotDetailsDir) {
  const files = detailFilesForDay(dayKey);
  const summaries = [];
  let totalBytes = 0;
  let largest = { file: null, bytes: 0, mb: 0 };

  ensureDir(snapshotDetailsDir);
  emptyDir(snapshotDetailsDir);

  for (const src of files) {
    const detail = readJsonSafe(src, null);
    if (!detail || typeof detail !== "object") continue;

    const matchId =
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

  return {
    count: summaries.length,
    totalBytes,
    totalMb: mb(totalBytes),
    largest,
    summaries
  };
}

export function exportDeploySnapshotDay(dayKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey || ""))) {
    throw new Error(`invalid dayKey: ${dayKey}`);
  }

  const startedAt = new Date().toISOString();

  const snapshotRoot = resolveDataPath("deploy-snapshots", dayKey);
  const snapshotDetailsDir = path.join(snapshotRoot, "details");

  ensureDir(snapshotRoot);
  ensureDir(snapshotDetailsDir);

  const fixturesPayload = readJsonSafe(resolveDataPath("fixtures.json"), { fixtures: [] });
  const fixtures = dayFixtures(fixturesPayload, dayKey);

  const value = valueForDay(dayKey);
  const detailsReport = copyDetails(dayKey, snapshotDetailsDir);

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
      detailsWithTravel: detailsReport.summaries.filter(x => x.hasTravel).length,
      detailsWithPlayerUsage: detailsReport.summaries.filter(x => x.hasPlayerUsage).length,
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

  writeJsonStable(resolveDataPath("deploy-snapshots", "latest.json"), latest);

  return {
    ok: true,
    date: dayKey,
    snapshotRoot,
    manifestFile: path.join(snapshotRoot, "manifest.json"),
    latestFile: resolveDataPath("deploy-snapshots", "latest.json"),
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