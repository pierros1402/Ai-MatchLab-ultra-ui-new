import fs from "node:fs";
import path from "node:path";
import { resolveDataPath } from "../storage/data-root.js";
import { currentSeason } from "../core/season.js";
import { validateCompetitionFormatRegistry } from "../core/competition-format-registry.js";
import { buildStandingsDay } from "./build-standings-day.js";
import { auditStandingsFoundation } from "./audit-standings-foundation.js";
import { readHistoryRows } from "../core/standings-foundation.js";

// Reviewed primary evidence supports TEAM_COUNT only. Never infer other rules
// or carry this verification into a different season.
export function verifiedIsraelContract(original, nowMs) {
  if (original?.competition?.slug !== "isr.2") throw new Error("official_contract_wrong_competition");
  if (currentSeason(new Date(nowMs)) !== "2026-2027") throw new Error("official_contract_evidence_season_expired");
  if (original.season?.reference === "2026-2027" && original.authority?.scopes?.includes("TEAM_COUNT")) {
    if (original.teamCount?.rule?.mode !== "EXACT" || original.teamCount.rule.value !== 16) throw new Error("official_contract_authority_conflict");
    return null;
  }
  if (!["UNVERIFIED", "NO_BASELINE"].includes(original.authority?.status)) throw new Error("official_contract_requires_separate_authority_review");
  return { ...structuredClone(original), contractId: "isr.2@2026-2027#v2", contractVersion: 2,
    season: { ...original.season, reference: "2026-2027" },
    authority: { status: "PARTIALLY_VERIFIED", scopes: ["TEAM_COUNT"], verifiedAt: "2026-10-01",
      evidence: [{ sourceClass: "PRIMARY_OFFICIAL", publisher: "Israel Football Association",
        title: "Liga Leumit league profile: 2026/2027 season, 16 teams",
        url: "https://www.football.org.il/leagues/league/?league_id=45", retrievedAt: "2026-10-01", supports: ["TEAM_COUNT"] }] },
    teamCount: { rule: { mode: "EXACT", value: 16, minimum: null, maximum: null }, enforcement: "STRICT_REPORT_ONLY", sourceLabel: "IFA official current-season league profile" } };
}

export async function prepareVerifiedCompetitionContracts(dayKey, nowMs) {
  const registryFile = resolveDataPath("competition-format-registry", "registry.v1.json");
  const beforeBytes = fs.readFileSync(registryFile);
  const registry = JSON.parse(beforeBytes);
  if (!validateCompetitionFormatRegistry(registry).ok) throw new Error("official_contract_preimage_registry_invalid");
  const index = registry.contracts.findIndex(row => row.competition.slug === "isr.2");
  const contract = verifiedIsraelContract(registry.contracts[index], nowMs);
  if (!contract) return { changed: false, writePaths: [] };
  registry.contracts[index] = contract;
  registry.coverage.teamCountAuthorityCount += 1;
  registry.coverage.unverifiedContractCount -= 1;
  registry.generatedAt = new Date(nowMs).toISOString();
  registry.registryVersion = `${new Date(nowMs).toISOString().slice(0,10)}.${Number(registry.registryVersion.split('.').at(-1)) + 1}`;
  const validation = validateCompetitionFormatRegistry(registry);
  if (!validation.ok) throw new Error(`official_contract_candidate_invalid:${JSON.stringify(validation.issues)}`);
  const season = currentSeason(new Date(nowMs));
  const standingsDir = resolveDataPath("standings");
  const names = fs.readdirSync(standingsDir).filter(name => name.endsWith(".json"));
  const slugs = new Set([...names.map(name => name.slice(0,-5)), ...readHistoryRows(season).map(row => row.leagueSlug).filter(Boolean)]);
  if (slugs.size > 1024 || [...slugs].some(slug => !/^[a-zA-Z0-9_.-]+$/.test(slug))) throw new Error("official_contract_standings_scope_invalid");
  const backups = new Map(names.map(name => [name, fs.readFileSync(path.join(standingsDir, name))]));
  const before = auditStandingsFoundation({ season });
  try {
    fs.writeFileSync(registryFile, JSON.stringify(registry, null, 2) + "\n");
    const built = await buildStandingsDay(dayKey, [...slugs].sort(), { season });
    const after = auditStandingsFoundation({ season });
    if (!built.ok || !after.ok || !after.passSlugs.includes("isr.2") || before.passSlugs.some(slug => !after.passSlugs.includes(slug))) throw new Error("official_contract_standings_validation_or_regression");
    return { changed: true, leagueSlug: "isr.2", season, verifiedScopes: ["TEAM_COUNT"],
      regressionCheck: "PASS", auditSummary: after.summary,
      writePaths: ["data/competition-format-registry/registry.v1.json", ...[...slugs].sort().map(slug => `data/standings/${slug}.json`)] };
  } catch (error) {
    fs.writeFileSync(registryFile, beforeBytes);
    for (const slug of slugs) {
      const name = `${slug}.json`, file = path.join(standingsDir, name);
      if (backups.has(name)) fs.writeFileSync(file, backups.get(name));
      else if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    throw error;
  }
}
