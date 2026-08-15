import crypto from "node:crypto";
import fs from "node:fs";

import { resolveDataPath } from "../storage/data-root.js";
import { canonicalTeamName } from "../storage/team-aliases-db.js";
import {
  buildCompetitionFormatRegistryIndex,
  resolveCompetitionFormatContract,
  validateCompetitionFormatRegistry,
} from "./competition-format-registry.js";
import { validateStandingsContract } from "../source-discovery/standings-contract-validator.js";

export const STANDINGS_FOUNDATION_SCHEMA =
  "ai-matchlab.history-backed-standings-foundation.v1";
export const STANDINGS_ARTIFACT_SCHEMA =
  "ai-matchlab.history-backed-standings.v1";

function clean(value) {
  return String(value ?? "").trim();
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, stable(value[key])]),
  );
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function sha256Json(value) {
  return sha256Bytes(Buffer.from(stableJson(value), "utf8"));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function sha256FileOrMissing(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    return sha256Bytes(Buffer.from(text, "utf8"));
  } catch {
    return "MISSING";
  }
}

function normalizeText(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function deriveStandingsCanonicalTeamId(slug, canonicalName) {
  const league = clean(slug);
  const team = normalizeText(canonicalName);
  if (!league || !team) return null;
  return `stid_${sha256Json({
    namespace: "ai-matchlab.league-scoped-standings-team.v1",
    leagueSlug: league,
    canonicalTeamName: team,
  }).slice(0, 24)}`;
}

export function isStrictStandingsHistoryRow(row, slug = null) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  if (slug && clean(row.leagueSlug) !== clean(slug)) return false;

  const status = clean(row.status).toUpperCase();
  if (!["FT", "FINAL", "STATUS_FULL_TIME", "FULL_TIME"].includes(status)) {
    return false;
  }

  if (
    typeof row.scoreHome !== "number" ||
    !Number.isFinite(row.scoreHome) ||
    row.scoreHome < 0 ||
    typeof row.scoreAway !== "number" ||
    !Number.isFinite(row.scoreAway) ||
    row.scoreAway < 0
  ) {
    return false;
  }

  if (!clean(row.homeTeam) || !clean(row.awayTeam)) return false;
  return true;
}

export function readHistoryRows(season) {
  const historyPath = resolveDataPath("history", `${season}.json`);
  const raw = readJson(historyPath);
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (Array.isArray(raw?.days)) {
    return raw.days.flatMap(day => Array.isArray(day?.rows) ? day.rows : []);
  }
  if (raw?.days && typeof raw.days === "object") {
    return Object.values(raw.days)
      .flatMap(day => Array.isArray(day?.rows) ? day.rows : []);
  }
  return [];
}

export function leagueHistoryRows(historyRows, slug) {
  return (Array.isArray(historyRows) ? historyRows : [])
    .filter(row => isStrictStandingsHistoryRow(row, slug));
}

export function leagueHistoryFingerprint(historyRows, slug) {
  const rows = leagueHistoryRows(historyRows, slug)
    .map(row => ({
      id: clean(row.id || row.matchId),
      leagueSlug: clean(row.leagueSlug),
      dayKey: clean(row.dayKey),
      kickoff: row.kickoff ?? null,
      kickoff_ms: Number.isFinite(row.kickoff_ms) ? row.kickoff_ms : null,
      homeTeam: clean(row.homeTeam),
      awayTeam: clean(row.awayTeam),
      scoreHome: row.scoreHome,
      scoreAway: row.scoreAway,
      status: clean(row.status).toUpperCase(),
      phase: clean(row.phase || "regular"),
    }))
    .sort((a, b) => {
      const ak = Number(a.kickoff_ms || 0);
      const bk = Number(b.kickoff_ms || 0);
      if (ak !== bk) return ak - bk;
      return a.id.localeCompare(b.id);
    });

  return {
    sha256: sha256Json(rows),
    rowCount: rows.length,
  };
}

function makeTeamRow(slug, teamName) {
  const canonical = canonicalTeamName(slug, teamName) || clean(teamName);
  return {
    position: 0,
    rank: 0,
    canonicalTeamId: deriveStandingsCanonicalTeamId(slug, canonical),
    team: canonical,
    teamName: canonical,
    name: canonical,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    goalDifference: 0,
    points: 0,
    confidence: 1,
  };
}

export function buildObservedStandingsTable(historyRows, slug) {
  const rows = leagueHistoryRows(historyRows, slug);
  const teams = new Map();

  function teamFor(alias) {
    const canonical = canonicalTeamName(slug, alias) || clean(alias);
    const id = deriveStandingsCanonicalTeamId(slug, canonical);
    if (!id) return null;
    if (!teams.has(id)) teams.set(id, makeTeamRow(slug, canonical));
    return teams.get(id);
  }

  for (const row of rows) {
    const home = teamFor(row.homeTeam);
    const away = teamFor(row.awayTeam);
    if (!home || !away || home.canonicalTeamId === away.canonicalTeamId) {
      continue;
    }

    home.played += 1;
    away.played += 1;
    home.goalsFor += row.scoreHome;
    home.goalsAgainst += row.scoreAway;
    away.goalsFor += row.scoreAway;
    away.goalsAgainst += row.scoreHome;

    if (row.scoreHome > row.scoreAway) {
      home.wins += 1;
      home.points += 3;
      away.losses += 1;
    } else if (row.scoreHome < row.scoreAway) {
      away.wins += 1;
      away.points += 3;
      home.losses += 1;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  const table = [...teams.values()].map(row => ({
    ...row,
    goalDiff: row.goalsFor - row.goalsAgainst,
    goalDifference: row.goalsFor - row.goalsAgainst,
  }));

  table.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return normalizeText(a.team).localeCompare(normalizeText(b.team));
  });

  return table.map((row, index) => ({
    ...row,
    position: index + 1,
    rank: index + 1,
  }));
}

export function loadStandingsFoundationRegistry() {
  const registryPath = resolveDataPath("competition-format-registry", "registry.v1.json");
  const registry = readJson(registryPath);
  const validation = validateCompetitionFormatRegistry(registry);
  if (!validation.ok) {
    const error = new Error("standings_foundation_registry_invalid");
    error.code = "STANDINGS_FOUNDATION_REGISTRY_INVALID";
    error.validation = validation;
    throw error;
  }
  return {
    registry,
    registryIndex: buildCompetitionFormatRegistryIndex(registry, { skipValidation: true }),
    registryPath,
    registrySha256: sha256FileOrMissing(registryPath),
  };
}

export function currentTeamAliasHash(slug) {
  return sha256FileOrMissing(resolveDataPath("team-aliases", `${slug}.json`));
}

export function buildHistoryBackedStandingsArtifact({
  slug,
  historySeason,
  historyRows,
  registryBundle = loadStandingsFoundationRegistry(),
  builtAt = new Date().toISOString(),
} = {}) {
  const leagueSlug = clean(slug);
  if (!leagueSlug) throw new Error("standings_foundation_slug_required");
  if (!clean(historySeason)) throw new Error("standings_foundation_history_season_required");

  const observedTable = buildObservedStandingsTable(historyRows, leagueSlug);
  const historyFingerprint = leagueHistoryFingerprint(historyRows, leagueSlug);
  const contract = resolveCompetitionFormatContract(
    registryBundle.registryIndex,
    leagueSlug,
    null,
  );

  const candidate = {
    league: leagueSlug,
    table: observedTable,
    phaseTables: {},
  };

  const contractValidation = validateStandingsContract({
    registry: registryBundle.registry,
    registryIndex: registryBundle.registryIndex,
    leagueSlug,
    seasonReference: contract?.season?.reference || null,
    standings: candidate,
  });

  const authorityScopes = Array.isArray(contract?.authority?.scopes)
    ? contract.authority.scopes
    : [];
  const hasTeamCountAuthority = authorityScopes.includes("TEAM_COUNT");
  const usable =
    observedTable.length > 0 &&
    hasTeamCountAuthority &&
    contractValidation.status === "PASS" &&
    contractValidation.ok === true;

  const reasonCodes = [];
  if (!contract) reasonCodes.push("NO_COMPETITION_FORMAT_CONTRACT");
  if (contract && !hasTeamCountAuthority) reasonCodes.push("TEAM_COUNT_AUTHORITY_MISSING");
  if (observedTable.length === 0) reasonCodes.push("NO_STRICT_HISTORY_ROWS");
  if (contractValidation.status !== "PASS") {
    reasonCodes.push(...contractValidation.issues
      .filter(item => item.severity === "error")
      .map(item => item.code));
  }

  const aliasHash = currentTeamAliasHash(leagueSlug);
  const confidence = usable ? 1 : 0;
  const table = usable
    ? observedTable.map(row => ({ ...row, confidence }))
    : [];

  return {
    schema: STANDINGS_ARTIFACT_SCHEMA,
    league: leagueSlug,
    seasonReference: contract?.season?.reference || null,
    updatedAt: builtAt,
    confidence,
    completeness: usable ? 1 : 0,
    sourceAudit: [
      {
        type: "history_foundation",
        label: `history-${historySeason}`,
        ok: historyFingerprint.rowCount > 0,
      },
      {
        type: "competition_contract",
        label: contract?.contractId || "no-contract",
        ok: contractValidation.status === "PASS",
      },
    ],
    phaseSummary: {
      hasPhaseTables: false,
      phaseKeys: [],
    },
    phaseTables: {},
    phases: {},
    table,
    foundation: {
      schema: STANDINGS_FOUNDATION_SCHEMA,
      status: usable ? "PASS" : "GATED",
      usable,
      reasonCodes: [...new Set(reasonCodes)].sort(),
      builtAt,
      historySeason: clean(historySeason),
      historyLeagueRows: historyFingerprint.rowCount,
      historyLeagueSha256: historyFingerprint.sha256,
      competitionFormatRegistrySha256: registryBundle.registrySha256,
      teamAliasesSha256: aliasHash,
      teamIdentityMode: "LEAGUE_SCOPED_CANONICAL_ALIAS_ID_V1",
      contractId: contract?.contractId || null,
      contractSeasonReference: contract?.season?.reference || null,
      contractAuthorityScopes: authorityScopes,
      contractValidation,
      observedRowCount: observedTable.length,
      observedTable,
      consumerTableRows: table.length,
      staleOnSourceChange: true,
    },
  };
}

export function validateStandingsFoundationArtifact(
  artifact,
  { historyRows = null, slug = null } = {},
) {
  const issues = [];
  const leagueSlug = clean(slug || artifact?.league);

  if (artifact?.schema !== STANDINGS_ARTIFACT_SCHEMA) {
    issues.push("ARTIFACT_SCHEMA_INVALID");
  }
  if (!leagueSlug || clean(artifact?.league) !== leagueSlug) {
    issues.push("ARTIFACT_LEAGUE_MISMATCH");
  }
  if (artifact?.foundation?.schema !== STANDINGS_FOUNDATION_SCHEMA) {
    issues.push("FOUNDATION_SCHEMA_INVALID");
  }
  if (artifact?.foundation?.status !== "PASS" || artifact?.foundation?.usable !== true) {
    issues.push("FOUNDATION_NOT_PASS");
  }
  if (!Array.isArray(artifact?.table) || artifact.table.length === 0) {
    issues.push("CONSUMER_TABLE_EMPTY");
  }
  if (artifact?.foundation?.contractValidation?.status !== "PASS") {
    issues.push("CONTRACT_NOT_PASS");
  }
  if (artifact?.foundation?.competitionFormatRegistrySha256 !==
      sha256FileOrMissing(resolveDataPath("competition-format-registry", "registry.v1.json"))) {
    issues.push("REGISTRY_FINGERPRINT_STALE");
  }
  if (artifact?.foundation?.teamAliasesSha256 !== currentTeamAliasHash(leagueSlug)) {
    issues.push("TEAM_ALIAS_FINGERPRINT_STALE");
  }

  const effectiveHistoryRows = historyRows || readHistoryRows(artifact?.foundation?.historySeason);
  const currentHistory = leagueHistoryFingerprint(effectiveHistoryRows, leagueSlug);
  if (artifact?.foundation?.historyLeagueSha256 !== currentHistory.sha256) {
    issues.push("HISTORY_FINGERPRINT_STALE");
  }
  if (Number(artifact?.foundation?.historyLeagueRows) !== currentHistory.rowCount) {
    issues.push("HISTORY_ROW_COUNT_STALE");
  }

  const ids = new Set();
  for (const row of artifact?.table || []) {
    const id = clean(row?.canonicalTeamId);
    if (!id) issues.push("CANONICAL_TEAM_ID_MISSING");
    else if (ids.has(id)) issues.push("CANONICAL_TEAM_ID_DUPLICATE");
    else ids.add(id);
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? "PASS" : "GATED",
    leagueSlug,
    issues: [...new Set(issues)].sort(),
    observedRows: artifact?.foundation?.observedRowCount ?? null,
    consumerRows: Array.isArray(artifact?.table) ? artifact.table.length : 0,
  };
}
