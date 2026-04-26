import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import {
  readTeamNewsRecord,
  writeTeamNewsRecord
} from "../storage/team-news-db.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function dedupeStrings(items = []) {
  const out = [];
  const seen = new Set();

  for (const raw of Array.isArray(items) ? items : []) {
    const text = normalizeText(raw);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }

  return out;
}

function normalizeAbsence(item = {}) {
  const player = normalizeText(item?.player || item?.name || item?.fullName);
  const reason = normalizeText(
    item?.reason || item?.status || item?.description || item?.note
  );
  const importance = normalizeText(item?.importance || "medium").toLowerCase();

  if (!player && !reason) return null;

  return {
    player: player || null,
    reason: reason || null,
    importance:
      importance === "high" || importance === "medium" || importance === "low"
        ? importance
        : "medium"
  };
}

function dedupeAbsences(items = []) {
  const out = [];
  const seen = new Set();

  for (const raw of Array.isArray(items) ? items : []) {
    const item = normalizeAbsence(raw);
    if (!item) continue;

    const key = [
      normalizeText(item.player).toLowerCase(),
      normalizeText(item.reason).toLowerCase(),
      normalizeText(item.importance).toLowerCase()
    ].join("__");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function normalizeEvidenceItem(item = {}) {
  const url = normalizeText(item?.url || item?.href);
  const label = normalizeText(item?.label || item?.title || item?.source);
  const publisher = normalizeText(item?.publisher || item?.site || item?.domain);
  const publishedAt = normalizeText(item?.publishedAt || item?.date);

  if (!url && !label && !publisher) return null;

  return {
    label: label || null,
    url: url || null,
    publisher: publisher || null,
    publishedAt: publishedAt || null
  };
}

function dedupeEvidence(items = []) {
  const out = [];
  const seen = new Set();

  for (const raw of Array.isArray(items) ? items : []) {
    const item = normalizeEvidenceItem(raw);
    if (!item) continue;

    const key = [
      normalizeText(item.url).toLowerCase(),
      normalizeText(item.label).toLowerCase(),
      normalizeText(item.publisher).toLowerCase()
    ].join("__");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function dedupeNotes(items = []) {
  const out = [];
  const seen = new Set();

  for (const raw of Array.isArray(items) ? items : []) {
    const text = normalizeText(raw);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }

  return out;
}

function mergeRecord(existing, incoming) {
  return {
    team: incoming.team,
    leagueSlug: incoming.leagueSlug || existing?.leagueSlug || null,
    matchIds: dedupeStrings([
      ...(existing?.matchIds || []),
      ...(incoming?.matchIds || [])
    ]),
    aliases: dedupeStrings([
      ...(existing?.aliases || []),
      ...(incoming?.aliases || []),
      incoming.team
    ]),
    absences: dedupeAbsences([
      ...(existing?.absences || []),
      ...(incoming?.absences || [])
    ]),
    notes: dedupeNotes([
      ...(existing?.notes || []),
      ...(incoming?.notes || [])
    ]),
    evidence: dedupeEvidence([
      ...(existing?.evidence || []),
      ...(incoming?.evidence || [])
    ]),
    source: incoming.source || existing?.source || "details-bootstrap",
    sourceMeta: {
      ...(existing?.sourceMeta || {}),
      ...(incoming?.sourceMeta || {})
    },
    updatedAt: new Date().toISOString()
  };
}

function resolveMatchSideTeamName(match = {}, sideName) {
  const side =
    sideName === "home"
      ? match?.homeTeam || {}
      : match?.awayTeam || {};

  return normalizeText(
    side?.team ||
      side?.name ||
      side?.displayName ||
      side?.shortName ||
      (sideName === "home"
        ? match?.homeTeamName
        : match?.awayTeamName)
  );
}

function sidePayloadToRecord(side, match, dayKey, sideName) {
  const team =
    normalizeText(side?.team) ||
    resolveMatchSideTeamName(match, sideName);
  const absences = dedupeAbsences(side?.absences || []);
  const notes = dedupeNotes(side?.notes || []);
  const evidence = dedupeEvidence(side?.evidence || []);

  if (!team) return null;
  if (absences.length === 0 && notes.length === 0 && evidence.length === 0) {
    return null;
  }

  return {
    team,
    leagueSlug: normalizeText(match?.leagueSlug) || null,
    matchIds: [String(match?.id || "")].filter(Boolean),
    aliases: [team],
    absences,
    notes,
    evidence,
    source: "details-bootstrap",
    sourceMeta: {
      bootstrapFrom: "details",
      dayKey,
      matchId: String(match?.id || "") || null,
      side: sideName
    }
  };
}

function extractTeamNewsCandidates(detail, dayKey) {
  const match = detail?.match || {};
  const out = [];

  const researched = detail?.researchedFacts?.teamNews?.data || null;
  if (researched?.homeTeam) {
    const rec = sidePayloadToRecord(researched.homeTeam, match, dayKey, "home");
    if (rec) out.push(rec);
  }
  if (researched?.awayTeam) {
    const rec = sidePayloadToRecord(researched.awayTeam, match, dayKey, "away");
    if (rec) out.push(rec);
  }

  const remoteResults = Array.isArray(detail?.remoteExecution?.results)
    ? detail.remoteExecution.results
    : [];

  for (const result of remoteResults) {
    const data = result?.result?.data || null;
    if (!data) continue;

    if (data?.homeTeam) {
      const rec = sidePayloadToRecord(data.homeTeam, match, dayKey, "home");
      if (rec) out.push(rec);
    }
    if (data?.awayTeam) {
      const rec = sidePayloadToRecord(data.awayTeam, match, dayKey, "away");
      if (rec) out.push(rec);
    }
  }

  return out;
}

function detailsDirPath(dayKey) {
  return resolveDataPath("details", dayKey);
}

function bootstrapReportPath(dayKey) {
  return resolveDataPath("team-news", "_bootstrap", `${dayKey}.details-bootstrap.json`);
}

export async function bootstrapTeamNewsFromDetails(dayKey) {
  const safeDayKey = normalizeText(dayKey);
  if (!safeDayKey) {
    throw new Error("missing dayKey");
  }

  const detailsDir = detailsDirPath(safeDayKey);
  if (!fs.existsSync(detailsDir)) {
    throw new Error(`details directory not found: ${detailsDir}`);
  }

  ensureDir(path.dirname(bootstrapReportPath(safeDayKey)));

  const files = fs
    .readdirSync(detailsDir)
    .filter(name => name.endsWith(".json"))
    .sort();

  const imported = [];
  const skipped = [];

  for (const file of files) {
    const filePath = path.join(detailsDir, file);
    const detail = readJsonSafe(filePath, null);

    if (!detail) {
      skipped.push({ file, reason: "invalid_json" });
      continue;
    }

    const records = extractTeamNewsCandidates(detail, safeDayKey);

    if (!records.length) {
      skipped.push({ file, reason: "no_team_news_candidates" });
      continue;
    }

    for (const incoming of records) {
      const existing = readTeamNewsRecord(incoming.team);
      const merged = mergeRecord(existing, incoming);
      writeTeamNewsRecord(merged);

      imported.push({
        file,
        team: incoming.team,
        leagueSlug: incoming.leagueSlug || null,
        matchIds: incoming.matchIds || [],
        absencesCount: Array.isArray(merged.absences) ? merged.absences.length : 0,
        notesCount: Array.isArray(merged.notes) ? merged.notes.length : 0,
        evidenceCount: Array.isArray(merged.evidence) ? merged.evidence.length : 0,
        hadExisting: !!existing
      });
    }
  }

  const report = {
    ok: true,
    dayKey: safeDayKey,
    detailsDir,
    filesCount: files.length,
    importedCount: imported.length,
    skippedCount: skipped.length,
    imported,
    skipped,
    updatedAt: new Date().toISOString()
  };

  fs.writeFileSync(
    bootstrapReportPath(safeDayKey),
    JSON.stringify(report, null, 2),
    "utf8"
  );

  return report;
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const dayKey = process.argv[2];

  console.log("[bootstrap-team-news-from-details] cli:start", { dayKey });

  bootstrapTeamNewsFromDetails(dayKey)
    .then(result => {
      console.log("[bootstrap-team-news-from-details] cli:done", result);
    })
    .catch(err => {
      console.error("[bootstrap-team-news-from-details] cli:fatal", err);
      process.exit(1);
    });
}