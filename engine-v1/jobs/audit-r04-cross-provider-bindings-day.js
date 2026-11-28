import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { athensDayKey } from "../core/daykey.js";
import { canonicalFixturesForDay } from "../core/day-fixture-universe.js";
import { readPrematchFinalForm } from "../core/prematch-verified-final-form.js";
import { discoverProviderCompetitionsDay } from "./discover-provider-competitions-day.js";

// Reuse the existing two-original-verified-finals identity policy. Research is
// read only; linked views are not allowed to become new evidence seeds.
export async function auditR04CrossProviderBindingsDay(dayKey = athensDayKey()) {
  const nowMs = Date.now();
  const source = await discoverProviderCompetitionsDay(dayKey, { write: false });
  if (!source.ok || !source.artifact) throw new Error("r04_independent_discovery_failed");
  const canonical = canonicalFixturesForDay(dayKey);
  const research = readPrematchFinalForm({}, nowMs);
  const proposals = [], unresolved = [];
  for (const fixture of source.artifact.fixtures.filter(f => f.eligibility === "eligible")) {
    if (canonical.some(c => c.providerIds?.flashscore === fixture.providerFixtureId ||
      c.source === "flashscore" && String(c.sourceMatchId || c.sourceId) === fixture.providerFixtureId)) continue;
    const candidate = { leagueSlug: fixture.canonicalSlug, providerMatchId: fixture.providerFixtureId,
      homeProviderTeamId: fixture.home.providerTeamId, awayProviderTeamId: fixture.away.providerTeamId,
      kickoffUtc: fixture.kickoffUtc, home: fixture.home.name, away: fixture.away.name };
    const matches = canonical.map(row => ({ row, proof: research.providerIdentityLinker(candidate, row) }))
      .filter(match => match.proof);
    if (matches.length === 1) proposals.push({
      providerFixtureId: fixture.providerFixtureId, canonicalId: matches[0].row.canonicalId,
      leagueSlug: fixture.canonicalSlug, proof: matches[0].proof
    });
    else unresolved.push({ providerFixtureId: fixture.providerFixtureId, leagueSlug: fixture.canonicalSlug,
      reason: matches.length ? "ambiguous_verified_identity" : "original_verified_identity_evidence_missing" });
  }
  const claims = new Map();
  for (const proposal of proposals) claims.set(proposal.canonicalId, (claims.get(proposal.canonicalId) || 0) + 1);
  const accepted = proposals.filter(p => claims.get(p.canonicalId) === 1);
  for (const p of proposals.filter(p => claims.get(p.canonicalId) !== 1))
    unresolved.push({ providerFixtureId: p.providerFixtureId, leagueSlug: p.leagueSlug, reason: "duplicate_canonical_claim" });
  return {
    schema: "ai-matchlab.r04-existing-verified-provider-binding-audit.v1", dayKey,
    generatedAt: new Date().toISOString(), sourceSha: process.env.GITHUB_SHA || null,
    discoveryHash: source.artifact.hash,
    policy: "existing_two_original_verified_finals_no_seed_propagation",
    canonicalMutationAuthorized: false,
    summary: { proposals: accepted.length, unresolved: unresolved.length, research: research.summary },
    proposals: accepted, unresolved
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dayKey = process.argv[2] || athensDayKey(), outputDirectory = process.argv[3];
  if (!outputDirectory) throw new Error("audit_output_directory_required");
  const report = await auditR04CrossProviderBindingsDay(dayKey);
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, "cross-provider-binding-audit.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary, null, 2));
}
