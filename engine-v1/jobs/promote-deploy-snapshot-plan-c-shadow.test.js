import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promoteDeploySnapshotLatestDay } from "./promote-deploy-snapshot-latest-day.js";

test("latest promotion exposes declared Plan C shadow payload and audit", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-plan-c-latest-"));
  const day = "2026-08-26";
  const resolveDataPath = (...parts) => path.join(root, ...parts);
  try {
    fs.mkdirSync(resolveDataPath("deploy-snapshots", day), { recursive: true });
    fs.writeFileSync(resolveDataPath("deploy-snapshots", day, "manifest.json"), JSON.stringify({
      ok: true,
      date: day,
      generatedAt: "2026-08-26T10:00:00.000Z",
      hash: "a".repeat(64),
      files: {
        planCShadow: "plan-c-shadow.json",
        planCShadowAudit: "plan-c-shadow-audit.json"
      }
    }), "utf8");
    const result = promoteDeploySnapshotLatestDay(day, {
      resolveDataPath,
      verifyContract: () => ({ ok: true })
    });
    assert.equal(result.ok, true);
    assert.equal(result.latest.planCShadow, `data/deploy-snapshots/${day}/plan-c-shadow.json`);
    assert.equal(result.latest.planCShadowAudit, `data/deploy-snapshots/${day}/plan-c-shadow-audit.json`);
    const persisted = JSON.parse(fs.readFileSync(resolveDataPath("deploy-snapshots", "latest.json"), "utf8"));
    assert.equal(persisted.planCShadow, result.latest.planCShadow);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
