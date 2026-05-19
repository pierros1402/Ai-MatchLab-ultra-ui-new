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

  if (!out.selfTest && !out.input) throw new Error("missing required --input <orchestrator-or-wrapper-report.json>");
  if (!out.selfTest && !out.output) throw new Error("missing required --output <review-summary.json>");

  return out;
}

function scoreKeyFromEvidence(row) {
  const direct = cleanString(row?.scoreKey || row?.verification?.verifiedFinalResult?.scoreKey);
  if (direct) return direct;

  const score = row?.score || row?.verification?.verifiedFinalResult?.score;
  if (score && Number.isFinite(Number(score.home)) && Number.isFinite(Number(score.away))) {
    return `${Number(score.home)}-${Number(score.away)}`;
  }

  return "";
}

function sourceKeyFromEvidence(row) {
  return cleanString(
    row?.sourceKey ||
    row?.sourceName ||
    row?.name ||
    row?.sourceUrl ||
    row?.url ||
    row?.source?.sourceKey ||
    row?.source?.sourceName
  );
}

function groupEvidenceByScore(evidenceRows) {
  const groups = new Map();

  for (const evidence of evidenceRows) {
    const scoreKey = scoreKeyFromEvidence(evidence) || "unknown_score";
    const sourceKey = sourceKeyFromEvidence(evidence) || "unknown_source";

    if (!groups.has(scoreKey)) {
      groups.set(scoreKey, {
        scoreKey,
        sourceCount: 0,
        sources: [],
        rows: []
      });
    }

    const group = groups.get(scoreKey);
    group.sourceCount += 1;
    group.sources.push(sourceKey);
    group.rows.push({
      sourceKey,
      scoreKey,
      status: evidence?.status || null,
      verdict: evidence?.verdict || null,
      sourceType: evidence?.sourceType || null,
      url: evidence?.sourceUrl || evidence?.url || null
    });
  }

  return [...groups.values()].map((group) => ({
    ...group,
    sources: [...new Set(group.sources.filter(Boolean))]
  }));
}

function compactCase(oneCase) {
  const verification = oneCase?.verification || {};
  const evidence = asArray(verification?.evidence);
  const verifiedFinalResult = verification?.verifiedFinalResult || null;
  const verdict = cleanString(oneCase?.verdict || verification?.verdict || "needs_more_evidence");

  const scoreGroups = groupEvidenceByScore(evidence);
  const usableEvidenceCount = evidence.filter((row) => cleanString(row?.verdict || row?.status)).length;
  const independentSourceCount = Number(verifiedFinalResult?.independentSourceCount || 0);

  return {
    matchId: cleanString(oneCase?.matchId),
    day: cleanString(oneCase?.day || oneCase?.date),
    leagueSlug: cleanString(oneCase?.leagueSlug),
    teams: oneCase?.teams || {
      homeTeam: cleanString(oneCase?.homeTeam),
      awayTeam: cleanString(oneCase?.awayTeam)
    },
    verdict,
    reason: cleanString(oneCase?.reason || verification?.reason),
    verifiedFinalResult: verifiedFinalResult ? {
      score: verifiedFinalResult.score || null,
      scoreKey: cleanString(verifiedFinalResult.scoreKey),
      verificationMode: cleanString(verifiedFinalResult.verificationMode),
      sourceKey: cleanString(verifiedFinalResult.sourceKey),
      independentSourceCount
    } : null,
    evidenceSummary: {
      evidenceRows: evidence.length,
      usableEvidenceCount,
      independentSourceCount,
      scoreGroups
    },
    reviewAction: verdict === "verified_final_result"
      ? "ready_for_read_only_review"
      : verdict === "conflict"
        ? "manual_conflict_review_required"
        : "needs_more_independent_evidence"
  };
}

function locateWrapperPayload(inputPayload, inputFile) {
  if (inputPayload?.reports?.verification?.cases) {
    return {
      wrapperPayload: inputPayload,
      wrapperFile: inputFile,
      sourceKind: "wrapper_report"
    };
  }

  const wrapperReportPath = cleanString(inputPayload?.outputs?.wrapperReport);
  if (wrapperReportPath) {
    const absolute = path.isAbsolute(wrapperReportPath)
      ? wrapperReportPath
      : resolveFromRoot(wrapperReportPath);

    if (!fs.existsSync(absolute)) {
      throw new Error(`wrapper report referenced by input does not exist: ${absolute}`);
    }

    return {
      wrapperPayload: readJson(absolute),
      wrapperFile: absolute,
      sourceKind: "orchestrator_report"
    };
  }

  throw new Error("input is neither a wrapper report nor an orchestrator report with outputs.wrapperReport");
}

function buildReviewSummary(inputPayload, options = {}) {
  const inputFile = options.inputFile || null;
  const located = locateWrapperPayload(inputPayload, inputFile);
  const verification = located.wrapperPayload?.reports?.verification || {};
  const cases = asArray(verification?.cases).map(compactCase);

  const byVerdict = {};
  for (const row of cases) {
    byVerdict[row.verdict] = (byVerdict[row.verdict] || 0) + 1;
  }

  const conflictCases = cases.filter((row) => row.verdict === "conflict");
  const needsMoreEvidenceCases = cases.filter((row) => row.verdict === "needs_more_evidence");
  const verifiedCases = cases.filter((row) => row.verdict === "verified_final_result");

  return {
    ok: true,
    job: "build-final-result-consensus-review-summary-file",
    generatedAt: new Date().toISOString(),
    input: {
      sourceKind: located.sourceKind,
      inputFile,
      wrapperFile: located.wrapperFile
    },
    summary: {
      totalCases: cases.length,
      byVerdict,
      verifiedCount: verifiedCases.length,
      conflictCount: conflictCases.length,
      needsMoreEvidenceCount: needsMoreEvidenceCases.length
    },
    verifiedCases,
    conflictCases,
    needsMoreEvidenceCases,
    allCases: cases,
    guarantees: {
      readOnlyDiagnosticSummary: true,
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
  const report = buildReviewSummary(inputPayload, { inputFile });

  writeJson(outputFile, report);

  return {
    ...report,
    inputFile,
    outputFile
  };
}

function selfTest() {
  const wrapper = {
    reports: {
      verification: {
        cases: [
          {
            matchId: "m1",
            teams: { homeTeam: "Alpha", awayTeam: "Beta" },
            verdict: "verified_final_result",
            verification: {
              verifiedFinalResult: {
                score: { home: 2, away: 1 },
                scoreKey: "2-1",
                verificationMode: "independent_consensus",
                sourceKey: "source-a",
                independentSourceCount: 2
              },
              evidence: [
                { sourceKey: "source-a", scoreKey: "2-1", status: "FT", verdict: "raw_evidence_ready" },
                { sourceKey: "source-b", scoreKey: "2-1", status: "FT", verdict: "raw_evidence_ready" }
              ]
            }
          },
          {
            matchId: "m2",
            teams: { homeTeam: "Gamma", awayTeam: "Delta" },
            verdict: "conflict",
            verification: {
              reason: "validated_evidence_score_conflict",
              evidence: [
                { sourceKey: "source-c", scoreKey: "1-0", status: "FT", verdict: "raw_evidence_ready" },
                { sourceKey: "source-d", scoreKey: "0-1", status: "FT", verdict: "raw_evidence_ready" }
              ]
            }
          }
        ]
      }
    }
  };

  const summary = buildReviewSummary(wrapper, { inputFile: "self-test-wrapper.json" });

  return {
    ok: summary.ok === true &&
      summary.summary.totalCases === 2 &&
      summary.summary.verifiedCount === 1 &&
      summary.summary.conflictCount === 1 &&
      summary.verifiedCases[0].verifiedFinalResult.scoreKey === "2-1" &&
      summary.conflictCases[0].evidenceSummary.scoreGroups.length === 2 &&
      summary.guarantees.canonicalWrites === 0,
    selfTest: "build-final-result-consensus-review-summary-file",
    summary: summary.summary,
    guarantees: summary.guarantees
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
  buildReviewSummary,
  run,
  selfTest
};