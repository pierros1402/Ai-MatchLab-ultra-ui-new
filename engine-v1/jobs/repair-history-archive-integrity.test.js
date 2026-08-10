import test from "node:test";
import assert from "node:assert/strict";
import { chooseArchiveDuplicateRetainedRow, parseCliArgs } from "./repair-history-archive-integrity.js";

function row(id, extra = {}) {
  return {
    id,
    container: "history-archive/x.1/2024.json",
    kickoff: "2024-01-01T20:00:00Z",
    homeTeam: "Home",
    awayTeam: "Away",
    scoreHome: 1,
    scoreAway: 0,
    ...extra
  };
}

test("retains the exact id still present in clean results-memory", () => {
  const group = {
    pair: "x.1|home|away",
    score: "1|0",
    rows: [row("123"), row("fdn_x1_match")]
  };
  const ids = new Map([["x.1", new Set(["fdn_x1_match"])]]);
  const chosen = chooseArchiveDuplicateRetainedRow(group, ids);
  assert.equal(chosen.row.id, "fdn_x1_match");
  assert.equal(chosen.reason, "exact_clean_results_memory_match_id");
});

test("expired fallback prefers canonical then fdn then prefixed espn", () => {
  const ids = new Map([["x.1", new Set()]]);
  let group = { pair: "x.1|home|away", score: "1|0", rows: [row("123"), row("fdn_x1_match"), row("cid_x1_match")] };
  assert.equal(chooseArchiveDuplicateRetainedRow(group, ids).row.id, "cid_x1_match");
  group = { pair: "x.1|home|away", score: "1|0", rows: [row("123"), row("espn_123"), row("fdn_x1_match")] };
  assert.equal(chooseArchiveDuplicateRetainedRow(group, ids).row.id, "fdn_x1_match");
  group = { pair: "x.1|home|away", score: "1|0", rows: [row("123"), row("espn_123")] };
  assert.equal(chooseArchiveDuplicateRetainedRow(group, ids).row.id, "espn_123");
});

test("fails closed when multiple duplicate ids survive in results-memory", () => {
  const group = { pair: "x.1|home|away", score: "1|0", rows: [row("a"), row("b")] };
  const ids = new Map([["x.1", new Set(["a", "b"])]]);
  assert.throws(() => chooseArchiveDuplicateRetainedRow(group, ids), /multiple_clean_results_ids/);
});

test("archive integrity uses complete fast audit for production pre/post gates", async () => {
  const fs = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const sourcePath = fileURLToPath(new URL("./repair-history-archive-integrity.js", import.meta.url));
  const source = fs.readFileSync(sourcePath, "utf8");
  assert.match(source, /buildHistoryArchiveFastAudit\(\)/u);
  assert.match(source, /const audit = suppliedAudit \|\| buildHistoryArchiveFastAudit\(\)/u);
  assert.match(source, /const afterAudit = buildHistoryArchiveFastAudit\(\)/u);
});

test("clean archive has explicit fixed-point no-op fast path", async () => {
  const fs = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const sourcePath = fileURLToPath(new URL("./repair-history-archive-integrity.js", import.meta.url));
  const source = fs.readFileSync(sourcePath, "utf8");
  assert.match(source, /fixedPointNoOp: true/u);
  assert.match(source, /const freshAudit = buildHistoryArchiveFastAudit\(\)/u);
  assert.match(source, /const alreadyClean = duplicateGroups === 0 && dayNormalizations === 0/u);
});

test("archive integrity CLI accepts equals and separate value forms", () => {
  assert.deepEqual(
    parseCliArgs(["--write", "--report=C:/tmp/report.json", "--backup-dir", "C:/tmp/backup"]),
    {
      write: true,
      report: "C:/tmp/report.json",
      "backup-dir": "C:/tmp/backup"
    }
  );

  assert.deepEqual(
    parseCliArgs(["--write", "--report", "C:/tmp/report.json", "--backup-dir=C:/tmp/backup"]),
    {
      write: true,
      report: "C:/tmp/report.json",
      "backup-dir": "C:/tmp/backup"
    }
  );
});
