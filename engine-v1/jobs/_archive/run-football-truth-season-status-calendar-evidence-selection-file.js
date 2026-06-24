#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const JOB = "run-football-truth-season-status-calendar-evidence-selection-file";

const LINK_JOB = "engine-v1/jobs/extract-football-truth-season-status-links-from-official-snapshots-file.js";
const FETCH_JOB = "engine-v1/jobs/fetch-fixture-league-date-autonomous-ranked-candidate-snapshots-file.js";
const EXTRACT_JOB = "engine-v1/jobs/extract-global-season-state-calendar-restart-evidence-file.js";
const SELECT_JOB = "engine-v1/jobs/select-football-truth-season-status-calendar-evidence-urls-file.js";

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

function runNode(args, { label }) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.status !== 0) {
    const err = [
      `${label} failed with exitCode=${result.status}`,
      result.stdout ? `STDOUT:\n${result.stdout}` : "",
      result.stderr ? `STDERR:\n${result.stderr}` : ""
    ].filter(Boolean).join("\n\n");

    throw new Error(err);
  }

  return {
    label,
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function summaryOf(filePath) {
  const data = readJson(filePath);
  return {
    path: filePath,
    summary: data.summary || {},
    guarantees: data.guarantees || {}
  };
}

function ensureReadOnlyGuarantees(report, stageName, { allowFetchStage = false } = {}) {
  const guarantees = report.guarantees || {};
  const summary = report.summary || {};

  if (summary.canonicalWrites !== 0 || guarantees.canonicalWrites !== 0) {
    throw new Error(`${stageName} violated canonicalWrites=0`);
  }

  if (summary.productionWrite !== false || guarantees.productionWrite !== false) {
    throw new Error(`${stageName} violated productionWrite=false`);
  }

  if (!allowFetchStage) {
    if (summary.sourceFetch === true || guarantees.sourceFetch === true) {
      throw new Error(`${stageName} unexpectedly fetched`);
    }
  }
}

function buildReport({
  officialSnapshots,
  output,
  workDir,
  allowFetch,
  limit,
  perSnapshotLimit,
  perLeagueLimit,
  minScore
}) {
  assertFile(officialSnapshots, "official snapshots input");

  for (const job of [LINK_JOB, FETCH_JOB, EXTRACT_JOB, SELECT_JOB]) {
    assertFile(job, "component job");
  }

  fs.mkdirSync(workDir, { recursive: true });

  const officialLinksOut = path.join(workDir, "official-internal-season-status-links.json");
  const internalSnapshotsOut = path.join(workDir, "internal-link-snapshots.json");
  const internalEvidenceOut = path.join(workDir, "internal-link-calendar-evidence.json");
  const selectedOut = path.join(workDir, "selected-calendar-evidence-urls.json");

  const stages = [];

  stages.push(runNode([
    LINK_JOB,
    "--input", officialSnapshots,
    "--output", officialLinksOut,
    "--limit", String(limit),
    "--per-snapshot-limit", String(perSnapshotLimit)
  ], { label: "extract_internal_official_links" }));

  const linksReport = summaryOf(officialLinksOut);
  ensureReadOnlyGuarantees(readJson(officialLinksOut), "extract_internal_official_links");

  const fetchArgs = [
    FETCH_JOB,
    "--input", officialLinksOut,
    "--limit", String(limit),
    "--output", internalSnapshotsOut
  ];

  if (allowFetch) fetchArgs.splice(1, 0, "--allow-fetch");

  stages.push(runNode(fetchArgs, { label: "fetch_internal_official_links" }));

  const fetchReport = summaryOf(internalSnapshotsOut);
  const fetchData = readJson(internalSnapshotsOut);

  if (!allowFetch) {
    if (fetchData.status !== "blocked") {
      throw new Error("fetch stage should be blocked when --allow-fetch is not provided");
    }
  }

  ensureReadOnlyGuarantees(fetchData, "fetch_internal_official_links", { allowFetchStage: allowFetch });

  if (!allowFetch) {
    const blockedReport = {
      ok: true,
      job: JOB,
      status: "blocked_missing_allow_fetch",
      inputPath: officialSnapshots,
      outputPath: output,
      workDir,
      summary: {
        officialSnapshotInput: officialSnapshots,
        officialInternalLinkCount: linksReport.summary.expandedCandidateUrlCount || 0,
        internalFetchedSnapshotCount: 0,
        calendarRestartEvidenceRowCount: 0,
        selectedUrlCount: 0,
        selectedLeagueCount: 0,
        allowFetch: false,
        sourceFetch: false,
        noFetch: true,
        noUrlFetch: true,
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true
      },
      guarantees: {
        fetchRequiresExplicitAllowFetch: true,
        noWebSearch: true,
        sourceFetch: false,
        noFetch: true,
        noUrlFetch: true,
        usesOnlyProvidedOfficialSnapshots: true,
        noRegistryWrites: true,
        noCanonicalPromotion: true,
        noFixtureWrites: true,
        noHistoryWrites: true,
        noValueWrites: true,
        noDetailsWrites: true,
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true,
        diagnosticOnly: true
      },
      stages: {
        links: linksReport,
        fetch: fetchReport
      }
    };

    writeJson(output, blockedReport);
    return blockedReport;
  }

  stages.push(runNode([
    EXTRACT_JOB,
    "--input", internalSnapshotsOut,
    "--output", internalEvidenceOut
  ], { label: "extract_calendar_restart_evidence" }));

  const evidenceData = readJson(internalEvidenceOut);
  ensureReadOnlyGuarantees(evidenceData, "extract_calendar_restart_evidence");

  stages.push(runNode([
    SELECT_JOB,
    "--input", internalEvidenceOut,
    "--output", selectedOut,
    "--per-league-limit", String(perLeagueLimit),
    "--min-score", String(minScore)
  ], { label: "select_calendar_evidence_urls" }));

  const selectedData = readJson(selectedOut);
  ensureReadOnlyGuarantees(selectedData, "select_calendar_evidence_urls");

  const finalReport = {
    ok: true,
    job: JOB,
    status: "completed",
    inputPath: officialSnapshots,
    outputPath: output,
    workDir,
    generatedFiles: {
      officialLinksOut,
      internalSnapshotsOut,
      internalEvidenceOut,
      selectedOut
    },
    summary: {
      officialSnapshotInput: officialSnapshots,
      officialInternalLinkCount: linksReport.summary.expandedCandidateUrlCount || 0,
      internalSelectedCandidateUrlCount: fetchReport.summary.selectedCandidateUrlCount || 0,
      internalFetchedSnapshotCount: fetchReport.summary.fetchedSnapshotCount || 0,
      internalRejectedCandidateCount: fetchReport.summary.rejectedCandidateCount || 0,
      calendarRestartEvidenceRowCount: evidenceData.summary?.calendarRestartEvidenceRowCount || 0,
      acceptedForFetchPlanningCount: evidenceData.summary?.acceptedForFetchPlanningCount || 0,
      rejectedEvidenceRowCount: evidenceData.summary?.rejectedEvidenceRowCount || 0,
      selectedUrlCount: selectedData.summary?.selectedUrlCount || 0,
      selectedLeagueCount: selectedData.summary?.selectedLeagueCount || 0,
      rejectedBySelectorCount: selectedData.summary?.rejectedBySelectorCount || 0,
      allowFetch: true,
      sourceFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      fetchRequiresExplicitAllowFetch: true,
      noWebSearch: true,
      sourceFetch: true,
      noFetch: false,
      noUrlFetch: false,
      usesOnlyProvidedOfficialSnapshots: true,
      noRegistryWrites: true,
      noCanonicalPromotion: true,
      noFixtureWrites: true,
      noHistoryWrites: true,
      noValueWrites: true,
      noDetailsWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    },
    stages: {
      links: linksReport,
      fetch: fetchReport,
      evidence: summaryOf(internalEvidenceOut),
      selected: summaryOf(selectedOut)
    },
    selectedRows: selectedData.selectedRows || [],
    scoredRows: selectedData.scoredRows || []
  };

  writeJson(output, finalReport);
  return finalReport;
}

function runSelfTest() {
  for (const job of [LINK_JOB, FETCH_JOB, EXTRACT_JOB, SELECT_JOB]) {
    runNode([job, "--self-test"], { label: `${job} self-test` });
  }

  return {
    ok: true,
    selfTest: JOB,
    checkedComponentJobs: [LINK_JOB, FETCH_JOB, EXTRACT_JOB, SELECT_JOB],
    summary: {
      sourceFetch: false,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      noWebSearch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noRegistryWrites: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    }
  };
}

function main() {
  if (hasFlag("--self-test")) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const officialSnapshots = argValue("--official-snapshots") || argValue("--input");
  const output = argValue("--output");
  const workDir = argValue("--work-dir") || path.join(path.dirname(output || "."), "season-status-calendar-evidence-selection-work");
  const allowFetch = hasFlag("--allow-fetch");
  const limit = Number(argValue("--limit", "120"));
  const perSnapshotLimit = Number(argValue("--per-snapshot-limit", "20"));
  const perLeagueLimit = Number(argValue("--per-league-limit", "5"));
  const minScore = Number(argValue("--min-score", "40"));

  if (!officialSnapshots) throw new Error("Missing --official-snapshots or --input");
  if (!output) throw new Error("Missing --output");

  const report = buildReport({
    officialSnapshots,
    output,
    workDir,
    allowFetch,
    limit,
    perSnapshotLimit,
    perLeagueLimit,
    minScore
  });

  console.log(JSON.stringify({
    ok: true,
    status: report.status,
    output,
    workDir,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();
