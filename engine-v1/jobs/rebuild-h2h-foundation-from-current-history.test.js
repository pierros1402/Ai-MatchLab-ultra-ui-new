import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadCurrentHistoryDocuments,
  rebuildH2HFoundationFromCurrentHistory,
} from "./rebuild-h2h-foundation-from-current-history.js";

test("loads only seasonal history JSON documents", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-h2h-history-"));
  try {
    fs.writeFileSync(path.join(root, "2025-2026.json"), JSON.stringify({ season: "2025-2026", days: [] }));
    fs.writeFileSync(path.join(root, "2025-2026.report.json"), JSON.stringify({ nope: true }));
    fs.writeFileSync(path.join(root, "notes.json"), JSON.stringify({ nope: true }));
    const docs = loadCurrentHistoryDocuments(root);
    assert.equal(docs.length, 1);
    assert.equal(docs[0].season, "2025-2026");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("sandbox materialization can run without writing production foundation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-h2h-foundation-"));
  const output = path.join(root, "h2h");
  try {
    const result = rebuildH2HFoundationFromCurrentHistory({
      historyDocuments: [{ rows: [{
        id: "m1",
        kickoff: "2026-08-01T12:00:00Z",
        dayKey: "2026-08-01",
        leagueSlug: "test.1",
        homeTeam: "Alpha",
        awayTeam: "Beta",
        scoreHome: 1,
        scoreAway: 0,
      }] }],
      outputRoot: output,
      writeFoundation: false,
    });
    assert.equal(result.ok, true);
    assert.equal(result.materialized.ok, true);
    assert.equal(result.foundation, null);
    assert.equal(fs.readdirSync(output).length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("foundation write refuses non-production H2H output root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-h2h-foundation-"));
  try {
    assert.throws(() => rebuildH2HFoundationFromCurrentHistory({
      historyDocuments: [{ rows: [{
        id: "m1",
        kickoff: "2026-08-01T12:00:00Z",
        dayKey: "2026-08-01",
        leagueSlug: "test.1",
        homeTeam: "Alpha",
        awayTeam: "Beta",
        scoreHome: 1,
        scoreAway: 0,
      }] }],
      outputRoot: path.join(root, "h2h"),
      writeFoundation: true,
    }), /h2h_foundation_requires_production_output_root/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
