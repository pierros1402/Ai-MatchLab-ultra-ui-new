import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyFinalResultEvidence } from "../football-truth/final-result-verifier.js";

function parseArgs(argv) {
  const out = {
    input: null,
    output: null,
    pretty: true,
    consensusMinSources: 2
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--input") {
      out.input = argv[++i] || null;
    } else if (arg === "--output") {
      out.output = argv[++i] || null;
    } else if (arg === "--compact") {
      out.pretty = false;
    } else if (arg === "--consensus-min-sources") {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 2) {
        throw new Error("--consensus-min-sources must be an integer >= 2");
      }
      out.consensusMinSources = value;
    } else if (arg === "--help" || arg === "-h") {
      out.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return out;
}

function usage() {
  return [
    "Usage:",
    "  node engine-v1/jobs/verify-final-result-evidence-file.js --input <evidence.json> [--output <report.json>]",
    "",
    "Input JSON shapes supported:",
    "  1) { \"watchRow\": {...}, \"evidenceRows\": [...] }",
    "  2) { \"watchRow\": {...}, \"candidates\": [...] }",
    "  3) [{ \"watchRow\": {...}, \"evidenceRows\": [...] }, ...]",
    "",
    "This job is read-only. It does not write canonical fixtures, value, history, standings, or details."
  ].join("\n");
}

function readJson(filePath) {
  if (!filePath) {
    throw new Error("Missing required --input <file>");
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Input file not found: ${resolved}`);
  }

  const raw = fs.readFileSync(resolved, "utf8").replace(/^\uFEFF/, "");

  return {
    resolved,
    json: JSON.parse(raw)
  };
}

function normalizeCase(row, index) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error(`Input case ${index} must be an object`);
  }

  const evidenceRows = Array.isArray(row.evidenceRows)
    ? row.evidenceRows
    : Array.isArray(row.candidates)
      ? row.candidates
      : null;

  if (!Array.isArray(evidenceRows)) {
    throw new Error(`Input case ${index} missing evidenceRows/candidates array`);
  }

  return {
    index,
    watchRow: row.watchRow || row.fixture || null,
    evidenceRows
  };
}

function buildReport(input, options = {}) {
  const cases = Array.isArray(input)
    ? input.map((row, index) => normalizeCase(row, index))
    : [normalizeCase(input, 0)];

  const results = cases.map(item => {
    const verification = verifyFinalResultEvidence(item.watchRow, item.evidenceRows, {
      consensusMinSources: options.consensusMinSources
    });

    return {
      index: item.index,
      fixtureId: item.watchRow?.fixtureId || item.watchRow?.id || null,
      date: item.watchRow?.date || item.watchRow?.dayKey || null,
      homeTeam: item.watchRow?.homeTeam || item.watchRow?.home || null,
      awayTeam: item.watchRow?.awayTeam || item.watchRow?.away || null,
      verdict: verification.verdict,
      ok: verification.ok,
      verifiedFinalResult: verification.verifiedFinalResult,
      reason: verification.reason || null,
      counts: verification.counts,
      conflicts: verification.conflicts || []
    };
  });

  const byVerdict = {};
  for (const row of results) {
    byVerdict[row.verdict] = (byVerdict[row.verdict] || 0) + 1;
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    job: "verify-final-result-evidence-file",
    mode: "read_only_diagnostic",
    canonicalWrites: 0,
    inputCases: results.length,
    byVerdict,
    results
  };
}

function writeReport(report, outputPath, pretty) {
  const body = JSON.stringify(report, null, pretty ? 2 : 0) + "\n";

  if (!outputPath) {
    process.stdout.write(body);
    return;
  }

  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, body, "utf8");
  console.log(JSON.stringify({
    ok: true,
    wrote: resolved,
    inputCases: report.inputCases,
    byVerdict: report.byVerdict,
    canonicalWrites: report.canonicalWrites
  }, null, 2));
}

function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log(usage());
    return;
  }

  const input = readJson(args.input);
  const report = buildReport(input.json, {
    consensusMinSources: args.consensusMinSources
  });

  writeReport(report, args.output, args.pretty);

  if ((report.byVerdict.conflict || 0) > 0) {
    process.exitCode = 2;
  } else if ((report.byVerdict.needs_more_evidence || 0) > 0) {
    process.exitCode = 1;
  }
}

const isDirectRun = process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: error?.message || String(error),
      job: "verify-final-result-evidence-file"
    }, null, 2));
    process.exitCode = 1;
  }
}
