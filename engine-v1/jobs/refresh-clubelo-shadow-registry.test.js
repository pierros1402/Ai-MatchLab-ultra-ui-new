import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  parseClubEloTop100,
  refreshClubEloShadowRegistry,
  writeClubEloRefreshFailureAudit
} from "./refresh-clubelo-shadow-registry.js";

function htmlFixture() {
  const rows = [];
  for (let rank = 1; rank <= 100; rank += 1) {
    const federation = rank % 2 ? "AAA" : "BBB";
    rows.push(`<tr><td class="l"><a href="/${federation}"><img alt="${federation}" src="/flag.png"/></a> <span class="min481"><small> ${rank} </small></span> <a href="/Club${rank}"><span class="NonAst">C${rank}</span><span class="Ast">Club ${rank}</span></a></td><td class="r">${2001 - rank}</td></tr>`);
  }
  return `<h1><a href="/2026-08-26/Ranking">Ranking</a></h1><p><small>Page created on 2026-08-27 08:00:00.</small></p>${rows.join("")}<!--${"x".repeat(110000)}-->`;
}

function registryFixture() {
  const registry = [];
  for (let rank = 1; rank <= 48; rank += 1) {
    const federation = rank % 2 ? "AAA" : "BBB";
    registry.push({
      projectId: `pt_${rank}`,
      projectName: `Club ${rank}`,
      projectLeague: "test.1",
      projectFederation: federation,
      clubeloSlug: `Club${rank}`,
      clubeloName: `Club ${rank}`,
      clubeloElo: 1500,
      clubeloRank: rank,
      clubeloFederation: federation,
      federationAgreement: true
    });
  }
  return {
    schema: "ai-matchlab.identity-registry.v1.1",
    source: { snapshotRetrievedAt: "2026-08-24T08:00:00.000Z" },
    accounting: { total: 48 },
    registry
  };
}

test("ClubElo structural parser preserves exact ranks, slugs, federation and Elo", () => {
  const parsed = parseClubEloTop100(htmlFixture());
  assert.equal(parsed.rows.length, 100);
  assert.equal(parsed.rows[0].rank, 1);
  assert.equal(parsed.rows[0].slug, "Club1");
  assert.equal(parsed.rows[0].federation, "AAA");
  assert.equal(parsed.rows[0].elo, 2000);
  assert.equal(parsed.rows[99].rank, 100);
  assert.equal(parsed.snapshotAsOf, "2026-08-26");
});

test("verified HTML refresh updates all 48 identities and freezes raw evidence", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-clubelo-refresh-"));
  try {
    const registryFile = path.join(root, "IDENTITY_REGISTRY.json");
    fs.writeFileSync(registryFile, `${JSON.stringify(registryFixture(), null, 2)}\n`, "utf8");
    const html = htmlFixture();
    const result = await refreshClubEloShadowRegistry({
      dayKey: "2026-08-27",
      registryFile,
      snapshotDir: path.join(root, "snapshots"),
      auditFile: path.join(root, "audit.json"),
      retrievedUtc: "2026-08-27T09:00:00.000Z",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        url: "https://clubelo.com/Ranking",
        headers: { get: name => name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null },
        text: async () => html
      })
    });
    assert.equal(result.audit.ok, true);
    assert.equal(result.audit.parsedCount, 100);
    assert.equal(result.audit.registryCount, 48);
    assert.equal(result.registry.registry[0].clubeloElo, 2000);
    assert.equal(result.registry.source.latestRefreshRetrievedAt, "2026-08-27T09:00:00.000Z");
    assert.equal(result.registry.source.latestRefreshCoverage.updated, 48);
    assert.equal(fs.existsSync(result.rawFile), true);
    assert.equal(fs.existsSync(result.parsedFile), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("refresh failure audit retains the last verified registry", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-clubelo-failure-"));
  try {
    const auditFile = path.join(root, "audit.json");
    const audit = writeClubEloRefreshFailureAudit({ dayKey: "2026-08-27", auditFile, error: new Error("timeout") });
    assert.equal(audit.ok, false);
    assert.equal(audit.action, "RETAIN_LAST_VERIFIED_REGISTRY");
    assert.equal(JSON.parse(fs.readFileSync(auditFile, "utf8")).productionEligible, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
