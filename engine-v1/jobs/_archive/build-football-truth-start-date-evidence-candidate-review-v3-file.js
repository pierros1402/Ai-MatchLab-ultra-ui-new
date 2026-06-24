#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const IN_DIR = path.join(DATA_ROOT, "_diagnostics", `host-mined-start-date-evidence-fetch-${DATE}`);
const OUT_DIR = path.join(DATA_ROOT, "_diagnostics", `start-date-evidence-candidate-review-v3-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function rel(p) {
  return path.relative(ROOT, p).replaceAll("\\", "/");
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
}

const knownOfficialHosts = {
  "eng.1":["premierleague.com"], "eng.2":["efl.com"], "eng.3":["efl.com"], "eng.4":["efl.com"], "eng.5":["thenationalleague.org.uk"],
  "ned.1":["eredivisie.nl"], "ned.2":["keukenkampioendivisie.nl"],
  "esp.1":["laliga.com"], "esp.2":["laliga.com"],
  "ger.1":["bundesliga.com"], "ger.2":["bundesliga.com"], "ger.3":["dfb.de"],
  "cro.1":["hnl.hr"], "ita.1":["legaseriea.it"], "ita.2":["legab.it"],
  "fra.1":["ligue1.com","lfp.fr"], "fra.2":["ligue2.fr","lfp.fr"],
  "por.1":["ligaportugal.pt"], "por.2":["ligaportugal.pt"],
  "den.1":["superliga.dk"], "den.2":["divisionsforeningen.dk"],
  "mex.1":["ligamx.net"], "mex.2":["ligamx.net"]
};

const knownNoisePrefixes = new Set(["www", "klo", "abc", "bad"]);

function validCompetitionSlug(slug) {
  if (!/^[a-z]{3}\.\d+$/.test(String(slug || ""))) return false;
  return !knownNoisePrefixes.has(String(slug).split(".")[0]);
}

function sameOrSubhost(host, officialHost) {
  if (!host || !officialHost) return false;
  return host === officialHost || host.endsWith(`.${officialHost}`);
}

function isKnownOfficialHost(slug, host) {
  return (knownOfficialHosts[slug] || []).some((h) => sameOrSubhost(host, h));
}

const monthMap = new Map(Object.entries({
  january:1, jan:1, february:2, feb:2, march:3, mar:3, april:4, apr:4, may:5, june:6, jun:6,
  july:7, jul:7, august:8, aug:8, september:9, sep:9, sept:9, october:10, oct:10,
  november:11, nov:11, december:12, dec:12
}));

function normalizeDate(y, m, d) {
  y = Number(y); m = Number(m); d = Number(d);
  if (!y || !m || !d) return null;
  if (y < 2026 || y > 2027 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function canonicalDateText(date) {
  if (!date) return [];
  const [y, m, d] = date.split("-").map(Number);
  const monthNames = [...monthMap.entries()].filter(([, v]) => v === m).map(([k]) => k);
  return [
    `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`,
    `${d}/${m}/${y}`,
    ...monthNames.map((name) => `${d} ${name} ${y}`),
    ...monthNames.map((name) => `${name} ${d} ${y}`)
  ].map((x) => x.toLowerCase());
}

function scoreAnchoredMention(fullText, matchIndex, matchText, date) {
  const raw = String(fullText || "").replace(/\s+/g, " ");
  const lower = raw.toLowerCase();
  const idx = matchIndex ?? lower.indexOf(String(matchText || "").toLowerCase());
  const before = lower.slice(Math.max(0, idx - 90), idx).trim();
  const after = lower.slice(idx + String(matchText || "").length, Math.min(lower.length, idx + String(matchText || "").length + 90)).trim();
  const local = `${before} ${String(matchText || "").toLowerCase()} ${after}`.replace(/\s+/g, " ").trim();
  const wider = lower.slice(Math.max(0, idx - 180), Math.min(lower.length, idx + String(matchText || "").length + 220)).replace(/\s+/g, " ").trim();

  let score = 0;

  if (/\b(start|starts|begin|begins|commence|commences|kick.?off)\s+(on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)?\s*$/i.test(before)) score += 18;
  if (/\b(will start|will begin|is set to start|set to start|starts on|start on|begins on|kick.?off on)\b/i.test(local)) score += 16;
  if (/\b(opening match round|opening round|first matchday|matchday 1|round 1|opening fixture|season opener)\b/i.test(local)) score += 10;
  if (/\b(new campaign|new season|2026\/27|2026-27|2026\/2027|2026-2027)\b/i.test(local)) score += 6;
  if (/\b(league|premier league|championship|eredivisie|season)\b/i.test(local)) score += 3;

  if (/^\s*(all you need|article|news|published|updated|last updated|privacy|cookie|cookies|terms|newsletter|subscribe)\b/i.test(after)) score -= 18;
  if (/\b(published|updated|last updated|article date|news date|awards|player of the year|goal of the year|solar eclipse|travel|tourism|concerts|events calendar)\b/i.test(local)) score -= 12;
  if (/\b(privacy|cookies|terms|newsletter|subscribe)\b/i.test(local)) score -= 4;

  if (score >= 12 && /\b(will start|starts on|start on|begins on|kick.?off on|opening match round)\b/i.test(wider)) score += 4;

  return {
    date,
    matchedText: matchText,
    matchIndex: idx,
    score,
    localContext: local,
    evidenceContext: wider
  };
}

function collectAnchoredMentions(context) {
  const raw = String(context || "").replace(/\s+/g, " ");
  const lower = raw.toLowerCase();
  const mentions = [];

  function add(date, matchIndex, matchText) {
    if (!date) return;
    mentions.push(scoreAnchoredMention(raw, matchIndex, matchText, date));
  }

  for (const m of lower.matchAll(/\b(2026|2027)[-/\.](0?[1-9]|1[0-2])[-/\.](0?[1-9]|[12]\d|3[01])\b/g)) {
    add(normalizeDate(m[1], m[2], m[3]), m.index || 0, m[0]);
  }

  for (const m of lower.matchAll(/\b(0?[1-9]|[12]\d|3[01])[-/\.](0?[1-9]|1[0-2])[-/\.](2026|2027)\b/g)) {
    add(normalizeDate(m[3], m[2], m[1]), m.index || 0, m[0]);
  }

  const monthNames = [...monthMap.keys()].sort((a, b) => b.length - a.length).join("|");
  const dayMonthYear = new RegExp(`\\b(?:(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\s+)?(0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?\\s+(${monthNames})\\s+(2026|2027)\\b`, "gi");
  for (const m of lower.matchAll(dayMonthYear)) {
    const date = normalizeDate(m[4], monthMap.get(m[3].toLowerCase()), m[2]);
    add(date, m.index || 0, m[0]);
  }

  const monthDayYear = new RegExp(`\\b(${monthNames})\\s+(0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?,?\\s+(2026|2027)\\b`, "gi");
  for (const m of lower.matchAll(monthDayYear)) {
    add(normalizeDate(m[3], monthMap.get(m[1].toLowerCase()), m[2]), m.index || 0, m[0]);
  }

  const dedup = new Map();
  for (const mention of mentions) {
    const key = `${mention.date}|${mention.matchedText}|${mention.matchIndex}`;
    if (!dedup.has(key) || dedup.get(key).score < mention.score) dedup.set(key, mention);
  }

  return [...dedup.values()].sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
}

function bestStartDateFromContexts(contexts) {
  const mentions = [];
  for (const context of contexts || []) mentions.push(...collectAnchoredMentions(context));
  mentions.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
  return mentions[0] || null;
}

const fetchedPath = path.join(IN_DIR, `host-mined-start-date-evidence-fetched-pages-${DATE}.jsonl`);
const classificationsPath = path.join(IN_DIR, `host-mined-start-date-evidence-classifications-${DATE}.jsonl`);
const targetsPath = path.join(IN_DIR, `host-mined-start-date-evidence-targets-${DATE}.jsonl`);

const fetchedRows = readJsonl(fetchedPath);
const classifications = readJsonl(classificationsPath);
const targets = readJsonl(targetsPath);

const targetBySlug = new Map(targets.map((t) => [t.competitionSlug, t]));
const fetchedRowsBySlug = new Map();
for (const row of fetchedRows) {
  if (!fetchedRowsBySlug.has(row.competitionSlug)) fetchedRowsBySlug.set(row.competitionSlug, []);
  fetchedRowsBySlug.get(row.competitionSlug).push(row);
}

const candidateClassifications = classifications.filter((c) => c.candidateNextSeasonStartDate);
const reviewRows = [];

for (const c of candidateClassifications) {
  const slug = c.competitionSlug;
  const target = targetBySlug.get(slug) || {};
  const candidateHost = c.candidateHost || hostOf(c.candidateUrl);
  const slugValid = validCompetitionSlug(slug);
  const knownOfficial = isKnownOfficialHost(slug, candidateHost);
  const minedHost = (target.hostCandidates || []).some((h) => sameOrSubhost(candidateHost, h.host));

  const contexts = [];
  if (c.candidateContext) contexts.push(c.candidateContext);
  for (const row of fetchedRowsBySlug.get(slug) || []) {
    if (row.candidateContext) contexts.push(row.candidateContext);
    for (const mention of row.dateMentions || []) if (mention?.context) contexts.push(mention.context);
  }

  const allMentions = [];
  for (const context of [...new Set(contexts)]) allMentions.push(...collectAnchoredMentions(context));
  allMentions.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));

  const bestMention = allMentions[0] || null;
  const selectedDate = bestMention?.date || null;
  const selectedContextScore = bestMention?.score ?? 0;

  const reasons = [];
  if (!slugValid) reasons.push("reject_invalid_or_noise_slug");
  if (!candidateHost) reasons.push("reject_missing_candidate_host");
  if (!knownOfficial) reasons.push("review_host_is_not_known_official");
  if (!knownOfficial && !minedHost) reasons.push("reject_host_not_known_official_or_mined");
  if (!selectedDate) reasons.push("reject_no_selected_start_date");
  if (selectedContextScore < 12) reasons.push("reject_selected_date_anchor_not_strict_enough");
  if (selectedDate && c.candidateNextSeasonStartDate && selectedDate !== c.candidateNextSeasonStartDate) reasons.push("corrected_candidate_date_from_article_or_page_date");

  const reviewStatus =
    slugValid &&
    knownOfficial &&
    selectedDate &&
    selectedContextScore >= 12
      ? "accepted_strict_official_start_date_v3"
      : "rejected_or_manual_review_v3";

  reviewRows.push({
    competitionSlug: slug,
    competitionName: c.competitionName,
    originalCandidateDate: c.candidateNextSeasonStartDate,
    selectedNextSeasonStartDate: selectedDate,
    candidateHost,
    candidateUrl: c.candidateUrl,
    candidateTitle: c.candidateTitle,
    slugValid,
    knownOfficialHost: knownOfficial,
    minedHost,
    selectedContextScore,
    reviewStatus,
    decisionReasons: reasons,
    selectedMatchedText: bestMention?.matchedText || null,
    selectedLocalContext: bestMention?.localContext || null,
    selectedEvidenceContext: bestMention?.evidenceContext || null,
    allDateMentions: allMentions.slice(0, 12)
  });
}

const accepted = reviewRows.filter((r) => r.reviewStatus === "accepted_strict_official_start_date_v3");
const rejected = reviewRows.filter((r) => r.reviewStatus !== "accepted_strict_official_start_date_v3");

const hostRankingIssues = targets
  .filter((t) => Array.isArray(t.hostCandidates) && t.hostCandidates.length > 1)
  .map((t) => {
    const known = knownOfficialHosts[t.competitionSlug] || [];
    const firstHost = t.hostCandidates[0]?.host || null;
    return {
      competitionSlug: t.competitionSlug,
      competitionName: t.enrichedCompetitionName || t.competitionName || t.competitionSlug,
      firstHost,
      knownOfficialHosts: known,
      knownOfficialNotFirst: known.length > 0 && !known.some((h) => sameOrSubhost(firstHost, h)),
      repairedPreferredHosts: [
        ...known.map((host) => ({ host, reason: "known_official_host_preferred" })),
        ...t.hostCandidates.filter((h) => !known.some((official) => sameOrSubhost(h.host, official))).map((h) => ({ host: h.host, reason: "mined_host_after_known_official", score: h.score }))
      ]
    };
  })
  .filter((r) => r.knownOfficialNotFirst);

const summary = {
  status: "passed",
  runner: "start_date_evidence_candidate_review_v3",
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  inputCandidateCount: candidateClassifications.length,
  reviewRowCount: reviewRows.length,
  acceptedStrictOfficialStartDateCount: accepted.length,
  rejectedOrManualReviewCount: rejected.length,
  acceptedStrictOfficialStartDateSlugs: accepted.map((r) => r.competitionSlug),
  correctedCandidateDateCount: reviewRows.filter((r) => r.decisionReasons.includes("corrected_candidate_date_from_article_or_page_date")).length,
  hostRankingKnownOfficialNotFirstCount: hostRankingIssues.length,
  recommendedNextLane: accepted.length
    ? "backfill_nextSeasonStartDate_from_v3_accepted_candidates_then_rerun_coverage_ledger"
    : "fix_host_ranking_and_run_source_specific_official_calendar_fetchers"
};

const outPath = path.join(OUT_DIR, `start-date-evidence-candidate-review-v3-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `start-date-evidence-candidate-review-v3-rows-${DATE}.jsonl`);
const acceptedPath = path.join(OUT_DIR, `accepted-start-date-evidence-candidates-v3-${DATE}.jsonl`);
const rejectedPath = path.join(OUT_DIR, `rejected-start-date-evidence-candidates-v3-${DATE}.jsonl`);
const hostRankingPath = path.join(OUT_DIR, `host-ranking-repair-findings-v3-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, reviewRows, hostRankingIssues }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, reviewRows.map((r) => JSON.stringify(r)).join("\n") + (reviewRows.length ? "\n" : ""), "utf8");
fs.writeFileSync(acceptedPath, accepted.map((r) => JSON.stringify(r)).join("\n") + (accepted.length ? "\n" : ""), "utf8");
fs.writeFileSync(rejectedPath, rejected.map((r) => JSON.stringify(r)).join("\n") + (rejected.length ? "\n" : ""), "utf8");
fs.writeFileSync(hostRankingPath, hostRankingIssues.map((r) => JSON.stringify(r)).join("\n") + (hostRankingIssues.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  acceptedOutput: rel(acceptedPath),
  rejectedOutput: rel(rejectedPath),
  hostRankingRepairFindingsOutput: rel(hostRankingPath),
  summary
}, null, 2));
