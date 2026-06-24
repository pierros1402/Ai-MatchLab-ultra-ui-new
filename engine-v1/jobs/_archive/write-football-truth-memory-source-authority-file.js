#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ALLOWED_TARGET_PATHS = new Set([
  "data/football-truth/source-authority-memory.json",
  "data/football-truth/evidence-gap-memory.json"
]);

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    selfTest: false,
    input: "",
    output: "",
    apply: false,
    allowMemoryWrite: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--allow-memory-write") args.allowMemoryWrite = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function normalizeTargetPath(value) {
  return String(value || "").replaceAll("\\", "/");
}

function emptyMemoryFile(targetPath) {
  return {
    schemaVersion: 1,
    kind: path.basename(targetPath, ".json"),
    updatedAt: "",
    records: []
  };
}

function readMemoryFile(targetPath) {
  if (!fs.existsSync(targetPath)) return emptyMemoryFile(targetPath);

  const parsed = readJson(targetPath);
  if (!Array.isArray(parsed.records)) {
    throw new Error(`Memory file must contain records array: ${targetPath}`);
  }

  return parsed;
}

function recordKey(record) {
  return [
    record.recordType || "",
    record.competitionSlug || "",
    record.providerId || ""
  ].join("::");
}

function upsertRecords(existing, records, timestamp) {
  const byKey = new Map();

  for (const record of existing.records || []) {
    byKey.set(recordKey(record), record);
  }

  for (const record of records) {
    byKey.set(recordKey(record), {
      ...record,
      updatedAt: timestamp
    });
  }

  return {
    ...existing,
    updatedAt: timestamp,
    records: [...byKey.values()].sort((a, b) => {
      return recordKey(a).localeCompare(recordKey(b));
    })
  };
}

function groupWriteRowsByTarget(writerPlan) {
  const grouped = new Map();

  for (const row of writerPlan.wouldWriteRows || []) {
    const targetPath = normalizeTargetPath(row.targetPath);

    if (!ALLOWED_TARGET_PATHS.has(targetPath)) {
      throw new Error(`Refusing unsupported targetPath: ${targetPath}`);
    }
    if (row.operation !== "upsert_memory_record") {
      throw new Error(`Unsupported operation for ${row.competitionSlug}: ${row.operation}`);
    }
    if (row.record?.approvedForPromotion === true) {
      throw new Error(`Refusing promotion-approved memory record in this writer: ${row.competitionSlug}`);
    }

    const rows = grouped.get(targetPath) || [];
    rows.push(row);
    grouped.set(targetPath, rows);
  }

  return grouped;
}

function buildWriteReport(writerPlan, options = {}) {
  const apply = options.apply === true;
  const allowMemoryWrite = options.allowMemoryWrite === true;

  if (apply && !allowMemoryWrite) {
    throw new Error("Refusing apply without --allow-memory-write");
  }

  const grouped = groupWriteRowsByTarget(writerPlan);
  const timestamp = new Date().toISOString();
  const targetReports = [];
  let actualWrites = 0;

  for (const [targetPath, rows] of grouped.entries()) {
    const records = rows.map((row) => row.record);
    const existing = readMemoryFile(targetPath);
    const next = upsertRecords(existing, records, timestamp);

    const beforeCount = existing.records.length;
    const afterCount = next.records.length;
    const upsertCount = records.length;

    if (apply) {
      writeJson(targetPath, next);
      actualWrites += 1;
    }

    targetReports.push({
      targetPath,
      beforeCount,
      afterCount,
      upsertCount,
      competitionSlugs: rows.map((row) => row.competitionSlug),
      recordTypes: [...new Set(rows.map((row) => row.recordType))].sort(),
      wroteFile: apply,
      canonicalWrites: 0,
      productionWrite: false
    });
  }

  return {
    ok: true,
    job: "write-football-truth-memory-source-authority",
    generatedAt: timestamp,
    mode: apply ? "apply" : "dry_run",
    inputSummary: writerPlan.summary || {},
    summary: {
      inputWouldWriteRowCount: writerPlan.summary?.wouldWriteRowCount || 0,
      targetPathCount: grouped.size,
      targetFileWriteCount: actualWrites,
      recordUpsertCount: [...grouped.values()].reduce((sum, rows) => sum + rows.length, 0),
      actualWrites,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: !apply
    },
    targetReports: targetReports.sort((a, b) => a.targetPath.localeCompare(b.targetPath)),
    allowedTargetPaths: [...ALLOWED_TARGET_PATHS].sort(),
    policy: {
      purpose: "Controlled writer for memory/source-authority records only.",
      noFetch: true,
      noSearch: true,
      allowedTargetsOnly: true,
      noCanonicalWrites: true,
      noPromotionWrites: true,
      noEndpointChasing: true,
      noSingleLeagueDrift: true
    },
    guarantees: {
      noFetch: true,
      noSearch: true,
      actualWrites,
      noCanonicalWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      sourceFetch: false
    }
  };
}

function runSelfTest() {
  const tempDir = fs.mkdtempSync(path.join(process.cwd(), "tmp-memory-writer-self-test-"));
  const sourceMemory = path.join(tempDir, "data/football-truth/source-authority-memory.json").replaceAll("\\", "/");
  const evidenceMemory = path.join(tempDir, "data/football-truth/evidence-gap-memory.json").replaceAll("\\", "/");

  const originalAllowed = [...ALLOWED_TARGET_PATHS];
  ALLOWED_TARGET_PATHS.clear();
  ALLOWED_TARGET_PATHS.add(sourceMemory);
  ALLOWED_TARGET_PATHS.add(evidenceMemory);

  try {
    const writerPlan = {
      summary: { wouldWriteRowCount: 2, actualWrites: 0, canonicalWrites: 0, productionWrite: false },
      wouldWriteRows: [
        {
          competitionSlug: "esp.1",
          providerId: "laliga_official",
          recordType: "source_authority_gap",
          targetPath: sourceMemory,
          operation: "upsert_memory_record",
          record: {
            recordType: "source_authority_gap",
            competitionSlug: "esp.1",
            providerId: "laliga_official",
            acceptedForRuntimeUse: true,
            approvedForPromotion: false
          }
        },
        {
          competitionSlug: "sco.challenge",
          providerId: "spfl_challenge_cup_official",
          recordType: "evidence_gap",
          targetPath: evidenceMemory,
          operation: "upsert_memory_record",
          record: {
            recordType: "evidence_gap",
            competitionSlug: "sco.challenge",
            providerId: "spfl_challenge_cup_official",
            acceptedForRuntimeUse: false,
            approvedForPromotion: false
          }
        }
      ]
    };

    const dryRunReport = buildWriteReport(writerPlan, { apply: false, allowMemoryWrite: false });
    if (dryRunReport.summary.actualWrites !== 0) {
      throw new Error("dry-run should not write");
    }
    if (fs.existsSync(sourceMemory) || fs.existsSync(evidenceMemory)) {
      throw new Error("dry-run created memory files unexpectedly");
    }

    const applyReport = buildWriteReport(writerPlan, { apply: true, allowMemoryWrite: true });
    if (applyReport.summary.actualWrites !== 2) {
      throw new Error(`expected 2 target file writes, got ${applyReport.summary.actualWrites}`);
    }

    const source = readJson(sourceMemory);
    const evidence = readJson(evidenceMemory);

    if (source.records.length !== 1 || source.records[0].competitionSlug !== "esp.1") {
      throw new Error("source authority self-test memory mismatch");
    }
    if (evidence.records.length !== 1 || evidence.records[0].competitionSlug !== "sco.challenge") {
      throw new Error("evidence gap self-test memory mismatch");
    }
    if (applyReport.guarantees.canonicalWrites !== 0 || applyReport.guarantees.productionWrite !== false) {
      throw new Error("write guarantees failed");
    }

    console.log(JSON.stringify({
      ok: true,
      selfTest: "passed",
      dryRunSummary: dryRunReport.summary,
      applySummary: applyReport.summary,
      guarantees: applyReport.guarantees
    }, null, 2));
  } finally {
    ALLOWED_TARGET_PATHS.clear();
    for (const value of originalAllowed) ALLOWED_TARGET_PATHS.add(value);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    runSelfTest();
    return;
  }

  if (!args.input) throw new Error("Missing required --input");
  if (!args.output) throw new Error("Missing required --output");

  const writerPlan = readJson(args.input);
  const report = buildWriteReport(writerPlan, {
    apply: args.apply,
    allowMemoryWrite: args.allowMemoryWrite
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    output: args.output,
    mode: report.mode,
    summary: report.summary,
    targetReports: report.targetReports,
    guarantees: report.guarantees
  }, null, 2));
}

main();
