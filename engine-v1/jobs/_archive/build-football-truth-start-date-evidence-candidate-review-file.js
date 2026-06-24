#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const IN_DIR = path.join(DATA_ROOT, "_diagnostics", `host-mined-start-date-evidence-fetch-${DATE}`);
const OUT_DIR = path.join(DATA_ROOT, "_diagnostics", `start-date-evidence-candidate-review-${DATE}`);
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

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function hostOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

const knownOfficialHosts = {
  "esp.1":["laliga.com"], "esp.2":["laliga.com"],
  "ger.1":["bundesliga.com"], "ger.2":["bundesliga.com"], "ger.3":["dfb.de"],
  "cro.1":["hnl.hr"], "cro.2":["hnl.hr"],
  "eng.1":["premierleague.com"], "eng.2":["efl.com"], "eng.3":["efl.com"], "eng.4":["efl.com"], "eng.5":["thenationalleague.org.uk"],
  "ita.1":["legaseriea.it"], "ita.2":["legab.it"],
  "fra.1":["ligue1.com","lfp.fr"], "fra.2":["ligue2.fr","lfp.fr"],
  "por.1":["ligaportugal.pt"], "por.2":["ligaportugal.pt"],
  "ned.1":["eredivisie.nl"], "ned.2":["keukenkampioendivisie.nl"],
  "bel.1":["proleague.be"], "bel.2":["proleague.be"],
  "aut.1":["bundesliga.at"], "aut.2":["2liga.at","bundesliga.at"],
  "sui.1":["sfl.ch"], "sui.2":["sfl.ch"],
  "tur.1":["tff.org"], "tur.2":["tff.org"],
  "gre.1":["slgr.gr"], "gre.2":["sl2.gr"],
  "sco.1":["spfl.co.uk"], "sco.2":["spfl.co.uk"],
  "den.1":["superliga.dk"], "den.2":["divisionsforeningen.dk"],
  "swe.1":["allsvenskan.se"], "swe.2":["superettan.se"],
  "nor.1":["eliteserien.no"], "nor.2":["obos-ligaen.no","fotball.no"],
  "fin.1":["veikkausliiga.com"], "fin.2":["palloliitto.fi"],
  "pol.1":["ekstraklasa.org"], "pol.2":["1liga.org"],
  "cze.1":["chance-liga.cz"], "cze.2":["fotbal.cz"],
  "ser.1":["superliga.rs"], "ser.2":["prvaliga.rs"],
  "ukr.1":["upl.ua"], "ukr.2":["pfl.ua"],
  "rus.1":["premierliga.ru"], "rus.2":["1fnl.ru"],
  "arg.1":["afa.com.ar"], "arg.2":["afa.com.ar"],
  "bra.1":["cbf.com.br"], "bra.2":["cbf.com.br"],
  "mex.1":["ligamx.net"], "mex.2":["ligamx.net"],
  "usa.1":["mlssoccer.com"], "usa.2":["uslchampionship.com"],
  "jpn.1":["jleague.co"], "jpn.2":["jleague.co"],
  "kor.1":["kleague.com"], "kor.2":["kleague.com"],
  "aus.1":["aleagues.com.au"], "chn.1":["thecfa.cn"], "chn.2":["thecfa.cn"],
  "ksa.1":["spl.com.sa"], "ksa.2":["saff.com.sa"],
  "qat.1":["qsl.qa"], "qat.2":["qfa.qa"]
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

function strictStartContextScore(context) {
  const c = String(context || "").toLowerCase();
  let score = 0;

  if (/\b(first match|opening match|opening game|season opener|opening fixture|kick-?off|matchday 1|round 1|fixture list|fixtures released|fixtures announced|calendar announced|calendar released)\b/i.test(c)) score += 4;
  if (/\b(start|starts|begin|begins|commence|commences|starts on|will start|is set to start)\b/i.test(c)) score += 3;
  if (/\b(2026\/27|2026-27|2026 27|2026\/2027|2026-2027|2026 2027)\b/i.test(c)) score += 2;
  if (/\b(league|premier league|championship|eredivisie|liga|serie|bundesliga|season)\b/i.test(c)) score += 1;

  if (/\b(published|updated|last updated|copyright|privacy|cookies|terms|newsletter|subscribe|download app|ticket|transfer window|birthday|founded|about us)\b/i.test(c)) score -= 4;
  if (/\b(fixture release date|fixtures released on|calendar released on|draw date)\b/i.test(c)) score -= 2;

  return score;
}

const reportPath = path.join(IN_DIR, `host-mined-start-date-evidence-fetch-report-${DATE}.json`);
const fetchedPath = path.join(IN_DIR, `host-mined-start-date-evidence-fetched-pages-${DATE}.jsonl`);
const classificationsPath = path.join(IN_DIR, `host-mined-start-date-evidence-classifications-${DATE}.jsonl`);
const targetsPath = path.join(IN_DIR, `host-mined-start-date-evidence-targets-${DATE}.jsonl`);

const report = readJsonSafe(reportPath);
const fetchedRows = readJsonl(fetchedPath);
const classifications = readJsonl(classificationsPath);
const targets = readJsonl(targetsPath);

if (!report) throw new Error(`Missing host-mined report: ${reportPath}`);

const targetBySlug = new Map(targets.map((t) => [t.competitionSlug, t]));
const fetchedRowsBySlug = new Map();
for (const row of fetchedRows) {
  if (!fetchedRowsBySlug.has(row.competitionSlug)) fetchedRowsBySlug.set(row.competitionSlug, []);
  fetchedRowsBySlug.get(row.competitionSlug).push(row);
}

const candidateSlugs = new Set(classifications.filter((c) => c.candidateNextSeasonStartDate).map((c) => c.competitionSlug));
const reviewRows = [];

for (const classification of classifications) {
  const slug = classification.competitionSlug;
  if (!candidateSlugs.has(slug)) continue;

  const slugValid = validCompetitionSlug(slug);
  const candidateHost = classification.candidateHost || hostOf(classification.candidateUrl);
  const knownOfficial = isKnownOfficialHost(slug, candidateHost);
  const target = targetBySlug.get(slug) || {};
  const minedHostCandidates = (target.hostCandidates || []).map((h) => h.host);
  const minedHost = minedHostCandidates.some((h) => sameOrSubhost(candidateHost, h));

  const candidateFetchedRows = (fetchedRowsBySlug.get(slug) || [])
    .filter((row) => row.candidateNextSeasonStartDate === classification.candidateNextSeasonStartDate || row.finalUrl === classification.candidateUrl || row.url === classification.candidateUrl);

  const evidenceContexts = [];
  if (classification.candidateContext) evidenceContexts.push(classification.candidateContext);
  for (const row of candidateFetchedRows) {
    if (row.candidateContext) evidenceContexts.push(row.candidateContext);
    for (const mention of row.dateMentions || []) {
      if (mention?.context) evidenceContexts.push(mention.context);
    }
  }

  const uniqueContexts = [...new Set(evidenceContexts.map((x) => String(x || "").replace(/\s+/g, " ").trim()).filter(Boolean))];
  const contextScores = uniqueContexts.map((context) => strictStartContextScore(context));
  const maxContextScore = contextScores.length ? Math.max(...contextScores) : 0;

  const decisionReasons = [];
  if (!slugValid) decisionReasons.push("reject_invalid_or_noise_slug");
  if (!candidateHost) decisionReasons.push("reject_missing_candidate_host");
  if (!knownOfficial && !minedHost) decisionReasons.push("reject_host_not_known_official_or_mined");
  if (!knownOfficial) decisionReasons.push("review_host_is_mined_not_known_official");
  if (maxContextScore < 5) decisionReasons.push("reject_context_not_strict_start_date");
  if (!classification.candidateNextSeasonStartDate) decisionReasons.push("reject_missing_date");

  const reviewStatus =
    slugValid &&
    classification.candidateNextSeasonStartDate &&
    (knownOfficial || minedHost) &&
    maxContextScore >= 5
      ? (knownOfficial ? "accepted_strict_official_start_date_candidate" : "review_mined_host_start_date_candidate")
      : "rejected_or_needs_manual_review";

  reviewRows.push({
    competitionSlug: slug,
    competitionName: classification.competitionName,
    candidateNextSeasonStartDate: classification.candidateNextSeasonStartDate,
    candidateHost,
    candidateUrl: classification.candidateUrl,
    candidateTitle: classification.candidateTitle,
    slugValid,
    knownOfficialHost: knownOfficial,
    minedHost,
    hostCandidates: minedHostCandidates,
    maxContextScore,
    reviewStatus,
    decisionReasons,
    evidenceContexts: uniqueContexts.slice(0, 8)
  });
}

const accepted = reviewRows.filter((r) => r.reviewStatus === "accepted_strict_official_start_date_candidate");
const minedReview = reviewRows.filter((r) => r.reviewStatus === "review_mined_host_start_date_candidate");
const rejectedOrManual = reviewRows.filter((r) => r.reviewStatus === "rejected_or_needs_manual_review");

const noiseRows = classifications
  .filter((c) => c.competitionSlug && !validCompetitionSlug(c.competitionSlug))
  .map((c) => ({ competitionSlug: c.competitionSlug, reason: "invalid_or_noise_slug_in_prior_pipeline" }));

const hostRankingFindings = targets
  .filter((t) => Array.isArray(t.hostCandidates) && t.hostCandidates.length > 1)
  .map((t) => {
    const known = knownOfficialHosts[t.competitionSlug] || [];
    const firstHost = t.hostCandidates[0]?.host || null;
    const knownButNotFirst = known.length > 0 && !known.some((h) => sameOrSubhost(firstHost, h));
    return {
      competitionSlug: t.competitionSlug,
      competitionName: t.enrichedCompetitionName || t.competitionName || t.competitionSlug,
      firstHost,
      knownOfficialHosts: known,
      knownOfficialNotFirst: knownButNotFirst,
      hostCandidates: t.hostCandidates
    };
  })
  .filter((r) => r.knownOfficialNotFirst);

const summary = {
  status: "passed",
  runner: "start_date_evidence_candidate_review",
  sourceReportPath: rel(reportPath),
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  inputTargetCount: report.summary?.targetCount ?? null,
  inputDateCandidateCount: candidateSlugs.size,
  reviewRowCount: reviewRows.length,
  acceptedStrictOfficialStartDateCandidateCount: accepted.length,
  minedHostManualReviewCandidateCount: minedReview.length,
  rejectedOrNeedsManualReviewCount: rejectedOrManual.length,
  acceptedStrictOfficialStartDateCandidateSlugs: accepted.map((r) => r.competitionSlug),
  minedHostManualReviewCandidateSlugs: minedReview.map((r) => r.competitionSlug),
  rejectedOrManualCandidateSlugs: rejectedOrManual.map((r) => r.competitionSlug),
  noiseSlugFindingCount: noiseRows.length,
  hostRankingKnownOfficialNotFirstCount: hostRankingFindings.length,
  recommendedNextLane: accepted.length
    ? "backfill_nextSeasonStartDate_for_accepted_strict_official_candidates_then_rerun_coverage_ledger"
    : "fix_host_ranking_and_add_source_specific_fixture_calendar_extractors_before_backfill"
};

const outPath = path.join(OUT_DIR, `start-date-evidence-candidate-review-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `start-date-evidence-candidate-review-rows-${DATE}.jsonl`);
const acceptedPath = path.join(OUT_DIR, `accepted-start-date-evidence-candidates-${DATE}.jsonl`);
const rejectedPath = path.join(OUT_DIR, `rejected-start-date-evidence-candidates-${DATE}.jsonl`);
const hostFindingsPath = path.join(OUT_DIR, `host-ranking-findings-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, reviewRows, noiseRows, hostRankingFindings }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, reviewRows.map((r) => JSON.stringify(r)).join("\n") + (reviewRows.length ? "\n" : ""), "utf8");
fs.writeFileSync(acceptedPath, accepted.map((r) => JSON.stringify(r)).join("\n") + (accepted.length ? "\n" : ""), "utf8");
fs.writeFileSync(rejectedPath, rejectedOrManual.map((r) => JSON.stringify(r)).join("\n") + (rejectedOrManual.length ? "\n" : ""), "utf8");
fs.writeFileSync(hostFindingsPath, hostRankingFindings.map((r) => JSON.stringify(r)).join("\n") + (hostRankingFindings.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  reviewRowsOutput: rel(rowsPath),
  acceptedOutput: rel(acceptedPath),
  rejectedOutput: rel(rejectedPath),
  hostRankingFindingsOutput: rel(hostFindingsPath),
  summary
}, null, 2));
