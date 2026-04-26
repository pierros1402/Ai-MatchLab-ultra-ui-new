import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import { readTeamNewsRecord } from "../storage/team-news-db.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function repairCommonMojibake(value) {
  let text = normalizeText(value);
  if (!text) return "";

  return text
    .replace(/\u0393\u00A9/g, "é")
    .replace(/\u0393\u0385/g, "á")
    .replace(/\u0393\u00B6/g, "ö")
    .replace(/\u0393\u00A4/g, "ä")
    .replace(/\u0393\u00B3/g, "ó")
    .replace(/\u0393\u00AD/g, "í")
    .replace(/\u0393\u00A6/g, "æ")
    .replace(/\u0393\u0388/g, "ø");
}

function readJsonFile(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function dedupeBy(items, getKey) {
  const out = [];
  const seen = new Set();

  for (const item of Array.isArray(items) ? items : []) {
    const key = normalizeKey(getKey(item));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function resolveRuntimePath(dayKey) {
  const candidates = [
    path.resolve(process.cwd(), `runtime-${dayKey}.json`),
    resolveDataPath(`runtime-${dayKey}.json`)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

function resolveDetailsDir(dayKey) {
  return resolveDataPath("details", dayKey);
}

function resolveWorksetPath(dayKey) {
  return resolveDataPath("team-news", "_worksets", `${dayKey}.json`);
}

function matchHomeTeam(match = {}) {
  return repairCommonMojibake(
    match?.homeTeam?.team ||
    match?.homeTeam?.name ||
    match?.homeTeam?.displayName ||
    match?.homeTeamName ||
    match?.home?.team ||
    match?.home?.name
  );
}

function matchAwayTeam(match = {}) {
  return repairCommonMojibake(
    match?.awayTeam?.team ||
    match?.awayTeam?.name ||
    match?.awayTeam?.displayName ||
    match?.awayTeamName ||
    match?.away?.team ||
    match?.away?.name
  );
}

function matchLeagueSlug(match = {}) {
  return normalizeText(
    match?.leagueSlug ||
    match?.league?.slug ||
    match?.competition?.slug
  );
}

function matchId(match = {}) {
  return normalizeText(match?.id || match?.matchId);
}

function matchKickoffUtc(match = {}) {
  return normalizeText(
    match?.kickoffUtc ||
    match?.startTime ||
    match?.date ||
    match?.dateUtc
  );
}

function extractMatchesFromRuntime(runtime) {
  if (Array.isArray(runtime?.matches)) return runtime.matches;
  if (Array.isArray(runtime?.fixtures)) return runtime.fixtures;
  if (Array.isArray(runtime)) return runtime;
  return [];
}

function buildTeamEntry(team, leagueSlug, dayKey, match, side) {
  const safeTeam = repairCommonMojibake(team);
  if (!safeTeam) return null;

  const safeSide = normalizeText(side).toLowerCase() === "away" ? "away" : "home";
  const homeTeam = matchHomeTeam(match) || null;
  const awayTeam = matchAwayTeam(match) || null;
  const opponent = safeSide === "home" ? awayTeam : homeTeam;

  const existing = readTeamNewsRecord(safeTeam);
  const lastUpdated = normalizeText(existing?.updatedAt);
  const source = normalizeText(existing?.source);
  const notesCount = Array.isArray(existing?.notes) ? existing.notes.length : 0;
  const absencesCount = Array.isArray(existing?.absences) ? existing.absences.length : 0;
  const evidenceCount = Array.isArray(existing?.evidence) ? existing.evidence.length : 0;

  const hasCanonical = !!existing;
  const hasUsableCanonicalEvidence =
    notesCount > 0 || absencesCount > 0 || evidenceCount > 0;

  const needsAcquisition = !hasCanonical || !hasUsableCanonicalEvidence;

  return {
    team: safeTeam,
    side: safeSide,
    opponent: opponent || null,
    leagueSlug: leagueSlug || null,
    dayKey,
    matchId: matchId(match) || null,
    kickoffUtc: matchKickoffUtc(match) || null,
    homeTeam,
    awayTeam,
    hasCanonical,
    hasUsableCanonicalEvidence,
    needsAcquisition,
    acquisitionReason: !hasCanonical
      ? "missing_canonical_record"
      : !hasUsableCanonicalEvidence
        ? "canonical_record_without_usable_team_news"
        : null,
    canonicalSource: source || null,
    canonicalUpdatedAt: lastUpdated || null,
    notesCount,
    absencesCount,
    evidenceCount
  };
}

export async function buildTeamNewsWorksetDay(dayKey) {
  const safeDayKey = normalizeText(dayKey);
  if (!safeDayKey) {
    throw new Error("missing dayKey");
  }

  const runtimePath = resolveRuntimePath(safeDayKey);
  const runtime = readJsonFile(runtimePath, null);
  const detailsDir = resolveDetailsDir(safeDayKey);

  let matches = [];

  if (runtime) {
    matches = extractMatchesFromRuntime(runtime);
  } else if (fs.existsSync(detailsDir)) {
    const detailFiles = fs
      .readdirSync(detailsDir)
      .filter(name => name.endsWith(".json"))
      .sort();

    matches = detailFiles
    .map(name => readJsonFile(path.join(detailsDir, name), null))
    .map(detail => {
      if (!detail) return null;

      if (detail?.match) return detail.match;

      if (detail?.basic) {
        return {
          id: detail.basic.matchId || detail.matchId || null,
          matchId: detail.basic.matchId || detail.matchId || null,
          leagueSlug: detail.basic.leagueSlug || null,
          homeTeamName: detail.basic.homeTeam || null,
          awayTeamName: detail.basic.awayTeam || null
        };
      }

      return null;
    })
    .filter(Boolean);
  } else {
    throw new Error(
      `no runtime file or details directory found for dayKey ${safeDayKey}`
    );
  }
  const rawEntries = [];

  for (const match of matches) {
    const leagueSlug = matchLeagueSlug(match);
    const homeTeam = matchHomeTeam(match);
    const awayTeam = matchAwayTeam(match);

    const homeEntry = buildTeamEntry(homeTeam, leagueSlug, safeDayKey, match, "home");
    const awayEntry = buildTeamEntry(awayTeam, leagueSlug, safeDayKey, match, "away");

    if (homeEntry) rawEntries.push(homeEntry);
    if (awayEntry) rawEntries.push(awayEntry);
  }

  const teams = dedupeBy(rawEntries, item => item.team);

  const existing = teams.filter(item => item.hasCanonical);
  const missing = teams.filter(item => !item.hasCanonical);
  const needsAcquisition = teams.filter(item => item.needsAcquisition);

  const report = {
    ok: true,
    dayKey: safeDayKey,
    runtimePath: runtime ? runtimePath : null,
    detailsDir: fs.existsSync(detailsDir) ? detailsDir : null,
    teamsCount: teams.length,
    existingCount: existing.length,
    missingCount: missing.length,
    needsAcquisitionCount: needsAcquisition.length,
    existing,
    missing,
    needsAcquisition,
    updatedAt: new Date().toISOString()
  };

  const outPath = resolveWorksetPath(safeDayKey);
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  return report;
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const dayKey = process.argv[2];

  console.log("[build-team-news-workset-day] cli:start", { dayKey });

  buildTeamNewsWorksetDay(dayKey)
    .then(result => {
      console.log("[build-team-news-workset-day] cli:done", {
        dayKey: result?.dayKey,
        teamsCount: result?.teamsCount || 0,
        existingCount: result?.existingCount || 0,
        missingCount: result?.missingCount || 0
      });
    })
    .catch(err => {
      console.error("[build-team-news-workset-day] cli:fatal", err);
      process.exit(1);
    });
}