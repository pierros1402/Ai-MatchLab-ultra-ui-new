#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function resolveFromRoot(file) {
  return path.resolve(ROOT_DIR, file);
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    input: "",
    output: "",
    selfTest: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") {
      out.selfTest = true;
      continue;
    }

    const nextValue = () => {
      index += 1;
      return cleanString(argv[index]);
    };

    if (arg === "--input") out.input = nextValue();
    else if (arg.startsWith("--input=")) out.input = cleanString(arg.slice("--input=".length));
    else if (arg === "--output") out.output = nextValue();
    else if (arg.startsWith("--output=")) out.output = cleanString(arg.slice("--output=".length));
    else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!out.selfTest && !out.input) throw new Error("missing required --input <review-summary.json>");
  if (!out.selfTest && !out.output) throw new Error("missing required --output <review-queue.json>");

  return out;
}

function scoreGroupsFor(row) {
  return asArray(row?.evidenceSummary?.scoreGroups).map((group) => ({
    scoreKey: cleanString(group?.scoreKey),
    sourceCount: Number(group?.sourceCount || 0),
    sources: asArray(group?.sources).map(cleanString).filter(Boolean),
    rows: asArray(group?.rows).map((evidence) => ({
      sourceKey: cleanString(evidence?.sourceKey),
      scoreKey: cleanString(evidence?.scoreKey),
      status: cleanString(evidence?.status),
      verdict: cleanString(evidence?.verdict),
      sourceType: cleanString(evidence?.sourceType),
      url: cleanString(evidence?.url)
    }))
  }));
}

function normalizeQueueRow(row, bucket) {
  const action = cleanString(row?.reviewAction) || (
    bucket === "verified" ? "ready_for_review" :
    bucket === "conflict" ? "manual_conflict_review_required" :
    "needs_more_independent_evidence"
  );

  return {
    queueId: [
      cleanString(row?.day || "unknown-day"),
      cleanString(row?.matchId || "unknown-match"),
      action
    ].join("::"),
    matchId: cleanString(row?.matchId),
    day: cleanString(row?.day),
    leagueSlug: cleanString(row?.leagueSlug),
    teams: row?.teams || {
      homeTeam: cleanString(row?.homeTeam),
      awayTeam: cleanString(row?.awayTeam)
    },
    verdict: cleanString(row?.verdict),
    reviewAction: action,
    priority: action === "manual_conflict_review_required"
      ? "high"
      : action === "needs_more_independent_evidence"
        ? "medium"
        : "normal",
    verifiedFinalResult: row?.verifiedFinalResult || null,
    reason: cleanString(row?.reason),
    evidenceSummary: {
      evidenceRows: Number(row?.evidenceSummary?.evidenceRows || 0),
      usableEvidenceCount: Number(row?.evidenceSummary?.usableEvidenceCount || 0),
      independentSourceCount: Number(row?.evidenceSummary?.independentSourceCount || 0),
      scoreGroups: scoreGroupsFor(row)
    },
    manualReview: {
      required: action !== "ready_for_review",
      status: "pending",
      reviewerDecision: "",
      reviewerNotes: "",
      allowedDecisions: action === "manual_conflict_review_required"
        ? ["accept_score_group", "reject_all", "needs_new_sources"]
        : action === "needs_more_independent_evidence"
          ? ["add_source", "reject_all", "defer"]
          : ["approve_read_only_verified", "defer"]
    }
  };
}

function buildReviewQueue(summaryPayload) {
  const verified = asArray(summaryPayload?.verifiedCases).map((row) => normalizeQueueRow(row, "verified"));
  const conflicts = asArray(summaryPayload?.conflictCases).map((row) => normalizeQueueRow(row, "conflict"));
  const needsMore = asArray(summaryPayload?.needsMoreEvidenceCases).map((row) => normalizeQueueRow(row, "needs_more_evidence"));

  const queueRows = [
    ...conflicts,
    ...needsMore,
    ...verified
  ];

  const byAction = {};
  for (const row of queueRows) {
    byAction[row.reviewAction] = (byAction[row.reviewAction] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-final-result-review-queue-file",
    generatedAt: new Date().toISOString(),
    sourceSummary: summaryPayload?.summary || null,
    summary: {
      totalRows: queueRows.length,
      byAction,
      highPriority: queueRows.filter((row) => row.priority === "high").length,
      mediumPriority: queueRows.filter((row) => row.priority === "medium").length,
      normalPriority: queueRows.filter((row) => row.priority === "normal").length
    },
    queueRows,
    guarantees: {
      readOnlyReviewQueue: true,
      canonicalWrites: 0,
      noFetch: true,
      noValidation: true,
      noFinalTruthDecision: true,
      noCanonicalPromotion: true,
      noProductionRepair: true,
      noFixtureWrite: true,
      noHistoryWrite: true,
      noValueWrite: true,
      noDetailsWrite: true
    }
  };
}

async function run(options) {
  const inputFile = resolveFromRoot(options.input);
  const outputFile = resolveFromRoot(options.output);

  if (!fs.existsSync(inputFile)) {
    throw new Error(`input file not found: ${inputFile}`);
  }

  const inputPayload = readJson(inputFile);
  const report = buildReviewQueue(inputPayload);

  writeJson(outputFile, report);

  return {
    ...report,
    inputFile,
    outputFile
  };
}

function selfTest() {
  const summaryPayload = {
    summary: {
      totalCases: 3,
      verifiedCount: 1,
      conflictCount: 1,
      needsMoreEvidenceCount: 1
    },
    verifiedCases: [
      {
        matchId: "m1",
        day: "2026-05-18",
        teams: { homeTeam: "Alpha", awayTeam: "Beta" },
        verdict: "verified_final_result",
        reviewAction: "ready_for_read_only_review",
        verifiedFinalResult: { scoreKey: "1-0", verificationMode: "independent_consensus" },
        evidenceSummary: { evidenceRows: 2, usableEvidenceCount: 2, independentSourceCount: 2, scoreGroups: [{ scoreKey: "1-0", sourceCount: 2, sources: ["a", "b"] }] }
      }
    ],
    conflictCases: [
      {
        matchId: "m2",
        day: "2026-05-18",
        teams: { homeTeam: "Gamma", awayTeam: "Delta" },
        verdict: "conflict",
        reviewAction: "manual_conflict_review_required",
        reason: "validated_evidence_score_conflict",
        evidenceSummary: { evidenceRows: 2, usableEvidenceCount: 2, independentSourceCount: 0, scoreGroups: [{ scoreKey: "1-0", sourceCount: 1, sources: ["c"] }, { scoreKey: "0-1", sourceCount: 1, sources: ["d"] }] }
      }
    ],
    needsMoreEvidenceCases: [
      {
        matchId: "m3",
        day: "2026-05-18",
        teams: { homeTeam: "Epsilon", awayTeam: "Zeta" },
        verdict: "needs_more_evidence",
        reviewAction: "needs_more_independent_evidence",
        evidenceSummary: { evidenceRows: 1, usableEvidenceCount: 1, independentSourceCount: 0, scoreGroups: [{ scoreKey: "0-0", sourceCount: 1, sources: ["e"] }] }
      }
    ]
  };

  const queue = buildReviewQueue(summaryPayload);

  return {
    ok: queue.ok === true &&
      queue.summary.totalRows === 3 &&
      queue.summary.byAction.manual_conflict_review_required === 1 &&
      queue.summary.byAction.needs_more_independent_evidence === 1 &&
      queue.queueRows[0].priority === "high" &&
      queue.queueRows[2].reviewAction === "ready_for_read_only_review" &&
      queue.guarantees.canonicalWrites === 0,
    selfTest: "build-final-result-review-queue-file",
    summary: queue.summary,
    guarantees: queue.guarantees
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  Promise.resolve()
    .then(async () => {
      const options = parseArgs();

      if (options.selfTest) {
        console.log(JSON.stringify(selfTest(), null, 2));
        return;
      }

      const report = await run(options);
      console.log(JSON.stringify({
        ok: report.ok,
        summary: report.summary,
        inputFile: report.inputFile,
        outputFile: report.outputFile,
        guarantees: report.guarantees
      }, null, 2));
    })
    .catch((error) => {
      console.error(error?.stack || error?.message || String(error));
      process.exit(1);
    });
}

export {
  parseArgs,
  buildReviewQueue,
  run,
  selfTest
};