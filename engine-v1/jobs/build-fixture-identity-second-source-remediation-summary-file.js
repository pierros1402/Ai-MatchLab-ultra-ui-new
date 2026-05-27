#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    }
  }
  return args;
}

function readJson(filePath, label) {
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function pickReason(row) {
  return String(
    row?.evidenceState ||
    row?.rejectionReason ||
    row?.reason ||
    row?.reviewReason ||
    row?.candidateState ||
    row?.validationState ||
    ""
  );
}

function hostFromUrl(url) {
  try {
    return new URL(String(url || "")).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function targetDateFromSeed(seed = {}) {
  return cleanString(seed.targetDate || seed.dayKey || seed.sourceTargetDate || "");
}

function addLeague(map, key, seed = {}, options = {}) {
  const leagueSlug = String(key || seed.leagueSlug || "unknown").trim() || "unknown";
  const seedTargetDate = targetDateFromSeed(seed);
  if (!map.has(leagueSlug)) {
    map.set(leagueSlug, {
      leagueSlug,
      name: seed.name || seed.leagueName || "",
      targetDate: seedTargetDate,
      sourceUrls: new Set(),
      hosts: new Set(),
      httpStatuses: new Set(),
      evidenceStates: new Map(),
      candidateStates: new Map(),
      evidenceReadyCount: 0,
      evidenceNotReadyCount: 0,
      preparedFixtureIdentityCount: 0,
      needsReviewFixtureIdentityCount: 0,
      outsideTargetDateCandidateCount: 0,
      needsDateReviewCandidateCount: 0,
      rejectedSnapshotCount: 0,
      sampleCandidates: [],
      sampleRejectedSnapshots: []
    });
  }

  const item = map.get(leagueSlug);
  if (!item.name && (seed.name || seed.leagueName)) item.name = seed.name || seed.leagueName;
  if (seedTargetDate && (!item.targetDate || options.preferTargetDate === true)) {
    item.targetDate = seedTargetDate;
  }

  const url = seed.resolvedUrl || seed.sourceUrl || seed.url || "";
  if (url) {
    item.sourceUrls.add(url);
    const host = hostFromUrl(url);
    if (host) item.hosts.add(host);
  }

  const status = seed.httpStatus ?? seed.statusCode ?? seed.status ?? seed?.http?.status;
  if (status !== undefined && status !== null && String(status) !== "") {
    item.httpStatuses.add(String(status));
  }

  return item;
}

function incMap(map, key) {
  const safeKey = String(key || "unknown");
  map.set(safeKey, (map.get(safeKey) || 0) + 1);
}

function classifyLeague(item) {
  const statuses = [...item.httpStatuses];
  const evidenceStates = Object.fromEntries(item.evidenceStates);
  const candidateStates = Object.fromEntries(item.candidateStates);

  const hasHttpNotOk = evidenceStates.http_not_ok > 0 || statuses.some((status) => status !== "200");
  const hasMissingDateSignal = evidenceStates.missing_date_signal > 0;
  const allCandidatesOutsideTarget =
    item.needsReviewFixtureIdentityCount > 0 &&
    item.outsideTargetDateCandidateCount === item.needsReviewFixtureIdentityCount;
  const hasNeedsDateReview = item.needsDateReviewCandidateCount > 0;

  let action = "investigate_second_source";
  let priority = 50;
  let blockedReason = "no_verified_fixture_identity_rows_prepared";

  if (item.preparedFixtureIdentityCount > 0) {
    action = "validate_prepared_fixture_identity_rows";
    priority = 10;
    blockedReason = "";
  } else if (hasHttpNotOk) {
    action = "resolve_replacement_second_source_url_http_not_ok";
    priority = 20;
    blockedReason = "second_source_http_not_ok";
  } else if (hasMissingDateSignal) {
    action = "resolve_replacement_second_source_url_missing_date_signal";
    priority = 30;
    blockedReason = "second_source_missing_target_date_signal";
  } else if (allCandidatesOutsideTarget) {
    action = "confirm_no_target_date_fixture_or_resolve_target_date_source";
    priority = 35;
    blockedReason = "all_fixture_candidates_outside_target_date";
  } else if (hasNeedsDateReview) {
    action = "manual_review_or_stricter_target_date_source_required";
    priority = 40;
    blockedReason = "fixture_identity_candidates_need_date_review";
  }

  return { action, priority, blockedReason, candidateStates, evidenceStates };
}

function buildSummary({ date, fetched, evidence, identity }) {
  const leagues = new Map();

  for (const row of arr(fetched?.fetchedSourceSnapshots)) {
    const item = addLeague(leagues, row.leagueSlug, row);
    const status = row?.http?.status ?? row.httpStatus ?? row.statusCode ?? row.status;
    if (status !== undefined && status !== null && String(status) !== "") item.httpStatuses.add(String(status));
  }

  for (const row of arr(evidence?.evidenceRows)) {
    const item = addLeague(leagues, row.leagueSlug, row);
    const state = pickReason(row) || (row.readyForReviewDecision ? "source_snapshot_evidence_prepared" : "unknown");
    incMap(item.evidenceStates, state);
    if (row.readyForReviewDecision === true) item.evidenceReadyCount += 1;
    else item.evidenceNotReadyCount += 1;
  }

  for (const row of arr(identity?.preparedFixtureIdentityRows)) {
    const item = addLeague(leagues, row.leagueSlug, row, { preferTargetDate: true });
    item.preparedFixtureIdentityCount += 1;
  }

  for (const row of arr(identity?.needsReviewFixtureIdentityRows)) {
    const item = addLeague(leagues, row.leagueSlug, row, { preferTargetDate: true });
    item.needsReviewFixtureIdentityCount += 1;
    const state = pickReason(row) || "needs_review";
    incMap(item.candidateStates, state);
    if (state === "fixture_identity_candidate_outside_target_date") item.outsideTargetDateCandidateCount += 1;
    if (state === "fixture_identity_candidate_needs_date_review") item.needsDateReviewCandidateCount += 1;
    if (item.sampleCandidates.length < 5) {
      item.sampleCandidates.push({
        homeTeam: row.homeTeam || "",
        awayTeam: row.awayTeam || "",
        candidateDate: row.candidateDate || "",
        candidateTime: row.candidateTime || "",
        evidenceState: state,
        sourceUrl: row.sourceUrl || row.resolvedUrl || ""
      });
    }
  }

  for (const row of arr(identity?.rejectedSnapshots)) {
    const item = addLeague(leagues, row.leagueSlug, row);
    item.rejectedSnapshotCount += 1;
    if (item.sampleRejectedSnapshots.length < 5) {
      item.sampleRejectedSnapshots.push({
        reason: pickReason(row),
        httpStatus: row.httpStatus ?? row?.http?.status ?? "",
        resolvedUrl: row.resolvedUrl || row.sourceUrl || ""
      });
    }
  }

  const remediationRows = [...leagues.values()].map((item) => {
    const classification = classifyLeague(item);
    return {
      leagueSlug: item.leagueSlug,
      name: item.name,
      targetDate: item.targetDate || date,
      action: classification.action,
      priority: classification.priority,
      blockedReason: classification.blockedReason,
      sourceUrls: [...item.sourceUrls],
      hosts: [...item.hosts],
      httpStatuses: [...item.httpStatuses],
      evidenceReadyCount: item.evidenceReadyCount,
      evidenceNotReadyCount: item.evidenceNotReadyCount,
      preparedFixtureIdentityCount: item.preparedFixtureIdentityCount,
      needsReviewFixtureIdentityCount: item.needsReviewFixtureIdentityCount,
      outsideTargetDateCandidateCount: item.outsideTargetDateCandidateCount,
      needsDateReviewCandidateCount: item.needsDateReviewCandidateCount,
      rejectedSnapshotCount: item.rejectedSnapshotCount,
      evidenceStates: classification.evidenceStates,
      candidateStates: classification.candidateStates,
      sampleCandidates: item.sampleCandidates,
      sampleRejectedSnapshots: item.sampleRejectedSnapshots,
      canonicalWriteEligible: false
    };
  }).sort((a, b) => a.priority - b.priority || a.leagueSlug.localeCompare(b.leagueSlug));

  const byAction = {};
  for (const row of remediationRows) {
    byAction[row.action] = (byAction[row.action] || 0) + 1;
  }

  const summary = {
    date,
    leagueCount: remediationRows.length,
    preparedLeagueCount: remediationRows.filter((row) => row.preparedFixtureIdentityCount > 0).length,
    blockedLeagueCount: remediationRows.filter((row) => row.preparedFixtureIdentityCount === 0).length,
    totalPreparedFixtureIdentityRows: remediationRows.reduce((sum, row) => sum + row.preparedFixtureIdentityCount, 0),
    totalNeedsReviewFixtureIdentityRows: remediationRows.reduce((sum, row) => sum + row.needsReviewFixtureIdentityCount, 0),
    totalOutsideTargetDateCandidateRows: remediationRows.reduce((sum, row) => sum + row.outsideTargetDateCandidateCount, 0),
    totalNeedsDateReviewCandidateRows: remediationRows.reduce((sum, row) => sum + row.needsDateReviewCandidateCount, 0),
    byAction,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };

  return {
    ok: true,
    job: "build-fixture-identity-second-source-remediation-summary-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_identity_second_source_remediation_summary",
    date,
    summary,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      deploySnapshotWrites: false,
      valueWrites: false,
      detailsWrites: false,
      productionWrite: false,
      dryRun: true
    },
    remediationRows
  };
}

function selfTest() {
  const fetched = {
    fetchedSourceSnapshots: [
      { leagueSlug: "ok.1", name: "OK League", dayKey: "2026-05-21", resolvedUrl: "https://example.com/ok", http: { status: 200 } },
      { leagueSlug: "bad.1", name: "Bad League", dayKey: "2026-05-22", resolvedUrl: "https://example.com/bad", http: { status: 404 } }
    ]
  };
  const evidence = {
    evidenceRows: [
      { leagueSlug: "ok.1", name: "OK League", targetDate: "2026-05-21", readyForReviewDecision: true, evidenceState: "source_snapshot_evidence_prepared" },
      { leagueSlug: "bad.1", name: "Bad League", targetDate: "2026-05-22", readyForReviewDecision: false, evidenceState: "http_not_ok", httpStatus: 404 }
    ]
  };
  const identity = {
    preparedFixtureIdentityRows: [],
    needsReviewFixtureIdentityRows: [
      { leagueSlug: "ok.1", name: "OK League", dayKey: "2026-05-22", homeTeam: "A", awayTeam: "B", evidenceState: "fixture_identity_candidate_needs_date_review" }
    ],
    rejectedSnapshots: []
  };
  const report = buildSummary({ date: "2026-05-22", fetched, evidence, identity });
  const okRow = report.remediationRows.find((row) => row.leagueSlug === "ok.1");
  if (!okRow || okRow.targetDate !== "2026-05-22") {
    throw new Error("self-test failed: identity row dayKey must override stale fetched/evidence targetDate.");
  }
  return report;
}

async function main() {
  const args = parseArgs(process.argv);
  const date = args.date || args.day || "2026-05-22";
  const output = args.output;

  if (!output) {
    throw new Error("--output is required");
  }

  const report = args.selfTest
    ? selfTest()
    : buildSummary({
        date,
        fetched: readJson(args.fetched, "--fetched"),
        evidence: readJson(args.evidence, "--evidence"),
        identity: readJson(args.identity, "--identity")
      });

  writeJson(output, report);
  console.log(JSON.stringify({
    ok: report.ok,
    output,
    mode: report.mode,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
