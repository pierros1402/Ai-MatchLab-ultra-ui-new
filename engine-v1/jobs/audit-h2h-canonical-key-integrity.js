/**
 * audit-h2h-canonical-key-integrity.js
 *
 * Read-only H2H filename/payload integrity audit under the dedicated H2H key
 * policy. It computes a deterministic inventory hash and proposes no writes.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import {
  H2H_CANONICAL_KEY_POLICY_VERSION,
  canonicalH2HPairIdentity,
  legacyH2HPairIdentity,
  compactRawIdentityKey
} from "../core/h2h-canonical-key-policy.js";

const __filename = fileURLToPath(import.meta.url);
const DEFAULT_MAX_EXAMPLES = 30;

function readBuffer(filePath) {
  return fs.readFileSync(filePath);
}

function readJsonBuffer(buffer) {
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    return null;
  }
}

function listJsonNames(dirPath) {
  try {
    return fs.readdirSync(dirPath)
      .filter(name => name.endsWith(".json") && !name.startsWith("_"))
      .sort();
  } catch {
    return [];
  }
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function computeH2HInventoryHash(dirPath) {
  const hash = crypto.createHash("sha256");
  const files = listJsonNames(dirPath);
  let bytes = 0;
  for (const name of files) {
    const buffer = readBuffer(path.join(dirPath, name));
    bytes += buffer.length;
    hash.update(name, "utf8");
    hash.update("\0", "utf8");
    hash.update(buffer);
    hash.update("\0", "utf8");
  }
  return { sha256: hash.digest("hex"), fileCount: files.length, bytes };
}

function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function compactMatch(row) {
  return {
    matchId: String(row?.matchId || row?.id || "") || null,
    date: row?.date || null,
    homeTeam: row?.homeTeam || null,
    awayTeam: row?.awayTeam || null,
    scoreHome: safeNum(row?.scoreHome),
    scoreAway: safeNum(row?.scoreAway),
    leagueSlug: row?.leagueSlug || null
  };
}

function matchFingerprint(row) {
  return JSON.stringify([
    String(row?.matchId || row?.id || ""),
    String(row?.date || ""),
    compactRawIdentityKey(row?.homeTeam),
    compactRawIdentityKey(row?.awayTeam),
    safeNum(row?.scoreHome),
    safeNum(row?.scoreAway)
  ]);
}

function pushExample(target, value, maxExamples) {
  if (target.length < maxExamples) target.push(value);
}

export function auditH2HPayload(
  fileName,
  payload,
  { resolveCanonical, maxExamples = DEFAULT_MAX_EXAMPLES } = {}
) {
  const actualFileName = path.basename(fileName);
  const pair = canonicalH2HPairIdentity(payload?.teamA, payload?.teamB, {
    resolveCanonical
  });
  const legacyPair = legacyH2HPairIdentity(payload?.teamA, payload?.teamB, {
    resolveCanonical
  });
  const expectedFileName = pair.key ? `${pair.key}.json` : null;
  const rows = Array.isArray(payload?.matches) ? payload.matches : [];
  const ids = new Map();
  let invalidMatchCount = 0;
  let duplicateMatchIdCount = 0;
  let conflictingDuplicateMatchIdCount = 0;
  let storedPairMismatchCount = 0;
  const examples = {
    invalidMatches: [],
    duplicateMatchIds: [],
    conflictingDuplicateMatchIds: [],
    storedPairMismatch: []
  };

  for (const row of rows) {
    const compact = compactMatch(row);
    const valid = Boolean(
      compact.matchId
      && compact.date
      && compact.homeTeam
      && compact.awayTeam
      && compact.scoreHome !== null
      && compact.scoreAway !== null
    );
    if (!valid) {
      invalidMatchCount++;
      pushExample(examples.invalidMatches, compact, maxExamples);
      continue;
    }

    const rowPair = canonicalH2HPairIdentity(
      compact.homeTeam,
      compact.awayTeam,
      { resolveCanonical }
    );
    if (!rowPair.valid || rowPair.key !== pair.key) {
      storedPairMismatchCount++;
      pushExample(examples.storedPairMismatch, compact, maxExamples);
    }

    const previous = ids.get(compact.matchId);
    if (previous) {
      duplicateMatchIdCount++;
      const same = matchFingerprint(previous) === matchFingerprint(row);
      if (!same) {
        conflictingDuplicateMatchIdCount++;
        pushExample(examples.conflictingDuplicateMatchIds, {
          matchId: compact.matchId,
          first: compactMatch(previous),
          duplicate: compact
        }, maxExamples);
      } else {
        pushExample(examples.duplicateMatchIds, compact, maxExamples);
      }
    } else {
      ids.set(compact.matchId, row);
    }
  }

  return {
    actualFileName,
    expectedFileName,
    sourcePairKey: actualFileName.replace(/\.json$/i, ""),
    legacyExpectedPairKey: legacyPair.key,
    policyExpectedPairKey: pair.key,
    nonCanonicalFileName: Boolean(expectedFileName && actualFileName !== expectedFileName),
    legacyDegradedPairKey: legacyPair.degraded,
    policyDegradedPairKey: !pair.valid || pair.degraded,
    keyCollision: pair.collision,
    keyPolicy: pair,
    matchCount: rows.length,
    invalidMatchCount,
    duplicateMatchIdCount,
    conflictingDuplicateMatchIdCount,
    storedPairMismatchCount,
    examples
  };
}

function buildTargetGroups(fileReports) {
  const map = new Map();
  for (const report of fileReports) {
    const target = report.expectedFileName || `__invalid__/${report.actualFileName}`;
    if (!map.has(target)) map.set(target, []);
    map.get(target).push(report);
  }
  return map;
}

export function buildH2HCanonicalKeyAudit(options = {}) {
  const h2hDir = path.resolve(options.h2hDir || resolveDataPath("h2h"));
  const maxExamples = Number(options.maxExamples) > 0
    ? Number(options.maxExamples)
    : DEFAULT_MAX_EXAMPLES;
  const before = computeH2HInventoryHash(h2hDir);
  const fileNames = listJsonNames(h2hDir);
  const fileReports = [];
  const examples = {
    invalidJsonFiles: [],
    legacyDegradedPairKeys: [],
    policyDegradedPairKeys: [],
    nonCanonicalFileNames: [],
    targetCollisions: [],
    storedPairMismatch: [],
    invalidMatches: [],
    conflictingDuplicateMatchIds: []
  };
  let invalidJsonFileCount = 0;
  let matchCount = 0;
  let legacyDegradedPairKeyCount = 0;
  let policyDegradedPairKeyCount = 0;
  let nonCanonicalFileNameCount = 0;
  let fallbackTeamIdentityCount = 0;
  let storedPairMismatchCount = 0;
  let invalidMatchCount = 0;
  let duplicateMatchIdCount = 0;
  let conflictingDuplicateMatchIdCount = 0;

  for (const fileName of fileNames) {
    const filePath = path.join(h2hDir, fileName);
    const buffer = readBuffer(filePath);
    const payload = readJsonBuffer(buffer);
    if (!payload) {
      invalidJsonFileCount++;
      pushExample(examples.invalidJsonFiles, fileName, maxExamples);
      fileReports.push({
        actualFileName: fileName,
        sourcePath: filePath,
        sourceSha256: sha256Buffer(buffer),
        sourceBytes: buffer.length,
        invalidJson: true,
        expectedFileName: null
      });
      continue;
    }

    const report = auditH2HPayload(fileName, payload, {
      resolveCanonical: options.resolveCanonical,
      maxExamples
    });
    const enriched = {
      ...report,
      sourcePath: filePath,
      sourceSha256: sha256Buffer(buffer),
      sourceBytes: buffer.length,
      payloadTeamA: payload?.teamA || null,
      payloadTeamB: payload?.teamB || null,
      matchIds: (Array.isArray(payload?.matches) ? payload.matches : [])
        .map(row => String(row?.matchId || row?.id || ""))
        .filter(Boolean)
    };
    fileReports.push(enriched);
    matchCount += report.matchCount;
    legacyDegradedPairKeyCount += Number(report.legacyDegradedPairKey);
    policyDegradedPairKeyCount += Number(report.policyDegradedPairKey);
    nonCanonicalFileNameCount += Number(report.nonCanonicalFileName);
    fallbackTeamIdentityCount += Number(report.keyPolicy?.left?.usedFallback)
      + Number(report.keyPolicy?.right?.usedFallback);
    storedPairMismatchCount += report.storedPairMismatchCount;
    invalidMatchCount += report.invalidMatchCount;
    duplicateMatchIdCount += report.duplicateMatchIdCount;
    conflictingDuplicateMatchIdCount += report.conflictingDuplicateMatchIdCount;

    if (report.legacyDegradedPairKey) {
      pushExample(examples.legacyDegradedPairKeys, {
        actual: fileName,
        legacyExpected: report.legacyExpectedPairKey,
        policyExpected: report.policyExpectedPairKey,
        teamA: payload?.teamA || null,
        teamB: payload?.teamB || null
      }, maxExamples);
    }
    if (report.policyDegradedPairKey) {
      pushExample(examples.policyDegradedPairKeys, {
        actual: fileName,
        policyExpected: report.policyExpectedPairKey,
        teamA: payload?.teamA || null,
        teamB: payload?.teamB || null,
        reasonCode: report.keyPolicy?.reasonCode || null
      }, maxExamples);
    }
    if (report.nonCanonicalFileName) {
      pushExample(examples.nonCanonicalFileNames, {
        actual: fileName,
        expected: report.expectedFileName,
        teamA: payload?.teamA || null,
        teamB: payload?.teamB || null
      }, maxExamples);
    }
    for (const row of report.examples.storedPairMismatch) {
      pushExample(examples.storedPairMismatch, {
        fileName,
        ...row
      }, maxExamples);
    }
    for (const row of report.examples.invalidMatches) {
      pushExample(examples.invalidMatches, {
        fileName,
        ...row
      }, maxExamples);
    }
    for (const row of report.examples.conflictingDuplicateMatchIds) {
      pushExample(examples.conflictingDuplicateMatchIds, {
        fileName,
        ...row
      }, maxExamples);
    }
  }

  const targetGroups = buildTargetGroups(fileReports.filter(row => !row.invalidJson));
  let targetCollisionCount = 0;
  for (const [target, rows] of targetGroups) {
    if (target.startsWith("__invalid__/") || rows.length <= 1) continue;
    targetCollisionCount++;
    pushExample(examples.targetCollisions, {
      target,
      sources: rows.map(row => row.actualFileName)
    }, maxExamples);
  }

  const after = computeH2HInventoryHash(h2hDir);
  if (before.sha256 !== after.sha256 || before.fileCount !== after.fileCount || before.bytes !== after.bytes) {
    throw new Error("H2H inventory changed during read-only audit.");
  }

  const errorCount = invalidJsonFileCount
    + policyDegradedPairKeyCount
    + storedPairMismatchCount
    + invalidMatchCount
    + conflictingDuplicateMatchIdCount;
  const warningCount = targetCollisionCount + nonCanonicalFileNameCount;

  return {
    ok: errorCount === 0,
    clean: errorCount === 0 && warningCount === 0,
    status: errorCount > 0
      ? "blocked"
      : warningCount > 0
        ? "repair_candidates_found"
        : "clean",
    schema: "ai-matchlab.h2h-canonical-key-integrity.v1",
    policyVersion: H2H_CANONICAL_KEY_POLICY_VERSION,
    generatedAt: new Date().toISOString(),
    sourceContract: {
      h2hReadOnly: true,
      historyReadOnly: true,
      archiveReadOnly: true,
      resultsMemoryReadOnly: true,
      reportWriteOnly: true,
      truthWrites: 0,
      truthFilesChanged: 0
    },
    inventory: {
      path: h2hDir,
      sha256: before.sha256,
      fileCount: before.fileCount,
      bytes: before.bytes,
      byteIdenticalAfterAudit: true
    },
    summary: {
      fileCount: fileNames.length,
      matchCount,
      invalidJsonFileCount,
      legacyDegradedPairKeyCount,
      policyDegradedPairKeyCount,
      fallbackTeamIdentityCount,
      nonCanonicalFileNameCount,
      targetCollisionCount,
      storedPairMismatchCount,
      invalidMatchCount,
      duplicateMatchIdCount,
      conflictingDuplicateMatchIdCount
    },
    fileReports,
    examples,
    guarantees: {
      h2hWrites: 0,
      historyWrites: 0,
      archiveWrites: 0,
      resultsMemoryWrites: 0,
      automaticRepair: 0
    }
  };
}

export function assertReportOutputOutsideH2H(outputPath, h2hDir) {
  const out = path.resolve(outputPath);
  const root = path.resolve(h2hDir);
  if (out === root || out.startsWith(`${root}${path.sep}`)) {
    throw new Error("Audit report output must be outside the H2H truth directory.");
  }
  return out;
}

export function writeAuditArtifact(outputPath, report, h2hDir) {
  const out = assertReportOutputOutsideH2H(outputPath, h2hDir);
  ensureDir(path.dirname(out));
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return out;
}

function parseArgs(argv) {
  const out = { h2hDir: null, output: null, maxExamples: DEFAULT_MAX_EXAMPLES };
  for (const arg of argv) {
    if (arg.startsWith("--h2h-dir=")) out.h2hDir = arg.slice(10);
    else if (arg.startsWith("--output=")) out.output = arg.slice(9);
    else if (arg.startsWith("--max-examples=")) out.maxExamples = Number(arg.slice(15));
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isCli) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log("Usage: node engine-v1/jobs/audit-h2h-canonical-key-integrity.js --output=<report.json> [--h2h-dir=<dir>]");
      process.exit(0);
    }
    const report = buildH2HCanonicalKeyAudit(args);
    let outputPath = null;
    if (args.output) outputPath = writeAuditArtifact(args.output, report, args.h2hDir || resolveDataPath("h2h"));
    console.log(JSON.stringify({
      ok: report.ok,
      clean: report.clean,
      status: report.status,
      schema: report.schema,
      policyVersion: report.policyVersion,
      generatedAt: report.generatedAt,
      outputPath,
      inventory: report.inventory,
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    process.exit(report.ok ? 0 : 2);
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error?.message || error) }, null, 2));
    process.exit(1);
  }
}
