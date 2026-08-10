import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCurrentHistoryIdentityAliasRepairPlan,
  applyCurrentHistoryIdentityAliasRepair,
} from "./repair-current-history-identity-alias-duplicates.js";
import { createProductionEvidenceIdentityOverlay } from "../core/production-evidence-identity-overlay.js";

function overlayStub() {
  return {
    overlayEvidenceMatchRow(row) {
      const retained = row.id === "cid_keep";
      return {
        ok: true,
        fixtureResolution: {
          resolvedFixtureId: row.id,
          sourceRole: retained ? "retained" : "unmanaged",
          managed: retained,
        },
        homeResolution: { preferredDisplayName: row.homeTeam },
        awayResolution: { preferredDisplayName: row.awayTeam },
      };
    },
  };
}

function writeHistory(root, rows) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "2025-2026.json"), JSON.stringify({ season: "2025-2026", days: [{ dayKey: "2026-07-01", matchCount: rows.length, rows }] }, null, 2));
  fs.writeFileSync(path.join(root, "2026-2027.json"), JSON.stringify({ season: "2026-2027", days: [] }, null, 2));
}

function writeResults(root, ids = []) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "test.1.json"), JSON.stringify({ teams: { A: ids.map(matchId => ({ matchId, opp: "B", gf: 1, ga: 0, ha: "H", date: "2026-07-01" })) } }, null, 2));
}

test("production retained lineage wins deterministic identity-alias duplicate repair", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-history-alias-"));
  try {
    const history = path.join(root, "history");
    const results = path.join(root, "results");
    writeHistory(history, [
      { id: "provider_1", kickoff: "2026-07-01T18:00:00Z", dayKey: "2026-07-01", leagueSlug: "test.1", homeTeam: "Alpha", awayTeam: "Beta", scoreHome: 1, scoreAway: 0, status: "FT" },
      { id: "cid_keep", kickoff: "2026-07-01T18:00:00Z", dayKey: "2026-07-01", leagueSlug: "test.1", homeTeam: "Alpha", awayTeam: "Beta", scoreHome: 1, scoreAway: 0, status: "FT" },
    ]);
    writeResults(results, ["provider_1"]);
    const plan = buildCurrentHistoryIdentityAliasRepairPlan({ historyRoot: history, resultsRoot: results, overlay: overlayStub() });
    assert.equal(plan.duplicateGroups, 1);
    assert.equal(plan.rowsToRemove, 1);
    assert.equal(plan.groups[0].keepId, "cid_keep");
    assert.equal(plan.groups[0].reason, "production_fixture_retained_lineage");
    const applied = applyCurrentHistoryIdentityAliasRepair({ plan, backupDir: path.join(root, "backup") });
    assert.equal(applied.removed, 1);
    const after = JSON.parse(fs.readFileSync(path.join(history, "2025-2026.json"), "utf8"));
    assert.deepEqual(after.days[0].rows.map(x => x.id), ["cid_keep"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test("Real Potosi/ABB provider duplicate resolves to the retained canonical lineage", () => {
  const overlay = createProductionEvidenceIdentityOverlay();

  const provider = overlay.overlayEvidenceMatchRow({
    id: "401867149",
    canonicalId: "401867149",
    matchId: "401867149",
    dayKey: "2026-07-09",
    kickoff: "2026-07-09T00:00:00.000Z",
    leagueSlug: "bol.1",
    homeTeam: "Real Potosí",
    awayTeam: "ABB",
    scoreHome: 3,
    scoreAway: 1,
    status: "FT",
  });

  const canonical = overlay.overlayEvidenceMatchRow({
    id: "cid_bol1_realpotosi_academiadelbalompie_20260709",
    canonicalId: "cid_bol1_realpotosi_academiadelbalompie_20260709",
    matchId: "cid_bol1_realpotosi_academiadelbalompie_20260709",
    dayKey: "2026-07-09",
    kickoff: "2026-07-09T00:00:00.000Z",
    leagueSlug: "bol.1",
    homeTeam: "Real Potosi",
    awayTeam: "Academia del Balompie",
    scoreHome: 3,
    scoreAway: 1,
    status: "FT",
  });

  assert.equal(provider.ok, true);
  assert.equal(provider.fixtureResolution.sourceRole, "unmanaged");
  assert.equal(canonical.ok, true);
  assert.equal(canonical.fixtureResolution.sourceRole, "retained");
  assert.equal(
    canonical.fixtureResolution.resolvedFixtureId,
    "cid_bol1_realpotosi_academiadelbalompie_20260709",
  );
  assert.equal(
    provider.homeResolution.globalClubId,
    canonical.homeResolution.globalClubId,
  );
  assert.equal(
    provider.awayResolution.globalClubId,
    canonical.awayResolution.globalClubId,
  );
  assert.equal(
    provider.awayResolution.preferredDisplayName,
    "Academia del Balompie",
  );
});


test("CLI entry detection is Windows-safe and uses fileURLToPath", () => {
  const sourcePath = fileURLToPath(
    new URL("./repair-current-history-identity-alias-duplicates.js", import.meta.url),
  );
  const source = fs.readFileSync(sourcePath, "utf8");
  assert.match(source, /fileURLToPath\(import\.meta\.url\)/u);
  assert.doesNotMatch(source, /new URL\(import\.meta\.url\)\.pathname/u);
});
