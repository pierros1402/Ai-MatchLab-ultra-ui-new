#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const IN_REL = `data/football-truth/_diagnostics/source-agnostic-standings-discovery-${DATE}/source-agnostic-standings-discovery-${DATE}.json`;
const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `source-agnostic-standings-quality-gate-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function readJson(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) throw new Error(`Missing input: ${relPath}`);
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

function rel(abs) {
  return path.relative(ROOT, abs).replaceAll("\\", "/");
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function norm(s) {
  return String(s ?? "").toLowerCase();
}

function classifySource(url) {
  const host = hostOf(url);
  if (!host) return { class: "missing_source", trusted: false };

  const hardRejectHosts = [
    "wikipedia.org",
    "en.wikipedia.org",
    "de.wikipedia.org",
    "github.com",
    "gist.github.com"
  ];

  if (hardRejectHosts.some((h) => host === h || host.endsWith(`.${h}`))) {
    return { class: "low_trust_reference_or_code_host", trusted: false };
  }

  const officialSignals = [
    "laliga.com",
    "hnl.hr",
    "spfl.co.uk",
    "the-afc.com",
    "jleague.co",
    "jleague.jp",
    "spl.com.sa",
    "qsl.qa",
    "ligaindonesiabaru.com",
    "indiansuperleague.com",
    "mlssoccer.com",
    "efl.com",
    "premierleague.com",
    "bundesliga.com",
    "legaseriea.it",
    "ligue1.com",
    "eredivisie.nl",
    "allsvenskan.se",
    "obos-ligaen.no",
    "fotball.no",
    "veikkausliiga.com"
  ];

  if (officialSignals.some((h) => host === h || host.endsWith(`.${h}`))) {
    return { class: "official_or_league_source", trusted: true };
  }

  const sportsDataSignals = [
    "soccerway.com",
    "flashscore.com",
    "worldfootball.net",
    "fbref.com",
    "footystats.org",
    "footballwebpages.co.uk",
    "soccerstats.com",
    "sportsmole.co.uk",
    "bbc.co.uk",
    "skysports.com",
    "espn.com"
  ];

  if (sportsDataSignals.some((h) => host === h || host.endsWith(`.${h}`))) {
    return { class: "sports_data_or_media_source", trusted: true };
  }

  return { class: "unknown_source_class", trusted: false };
}

function expectedMinRows(slug) {
  if (["eng.1","esp.1","ita.1","fra.1","mex.1","per.1","rou.1","idn.1"].includes(slug)) return 18;
  if (["eng.2","eng.3","eng.4"].includes(slug)) return 24;
  if (["esp.2"].includes(slug)) return 20;
  if (["sco.1","cro.1"].includes(slug)) return 10;
  if (["qat.1","ind.1","ksa.1"].includes(slug)) return 8;
  return 8;
}

function classifyResult(r) {
  const source = classifySource(r.sourceUrl);
  const rowCount = Number(r.rowCount || 0);
  const arithmeticStatus = r.arithmetic?.status || "not_assessed";
  const minRows = expectedMinRows(r.competitionSlug);
  const currentEvidenceRows = (r.rows || []).filter((row) => row.currentEvidence === true).length;
  const nameEvidenceRows = (r.rows || []).filter((row) => row.nameEvidence === true).length;

  const rowCountOk = rowCount >= minRows;
  const sourceTrusted = source.trusted;
  const arithmeticPassed = arithmeticStatus === "passed";
  const arithmeticWeakButNotFailed = arithmeticStatus === "not_assessed";
  const arithmeticFailed = arithmeticStatus === "failed_or_variant_scoring";

  let gateStatus = "rejected";
  let reason = "unclassified";

  if (rowCount <= 0) {
    gateStatus = "unresolved";
    reason = "no_rows";
  } else if (!sourceTrusted) {
    gateStatus = "rejected";
    reason = `untrusted_source:${source.class}`;
  } else if (!rowCountOk) {
    gateStatus = "rejected";
    reason = `row_count_below_expected:${rowCount}<${minRows}`;
  } else if (arithmeticPassed) {
    gateStatus = "verified";
    reason = "trusted_source_arithmetic_passed";
  } else if (arithmeticWeakButNotFailed && (currentEvidenceRows > 0 || nameEvidenceRows > 0)) {
    gateStatus = "provisional";
    reason = "trusted_source_rows_found_but_arithmetic_not_assessed";
  } else if (arithmeticFailed) {
    gateStatus = "review";
    reason = "trusted_source_rows_found_but_arithmetic_failed_or_variant_scoring";
  } else {
    gateStatus = "review";
    reason = `trusted_source_unclear_arithmetic:${arithmeticStatus}`;
  }

  return {
    competitionSlug: r.competitionSlug,
    name: r.name,
    country: r.country,
    gateStatus,
    reason,
    sourceClass: source.class,
    sourceTrusted,
    sourceHost: hostOf(r.sourceUrl),
    sourceUrl: r.sourceUrl,
    rowCount,
    expectedMinRows: minRows,
    arithmeticStatus,
    arithmeticFailures: r.arithmetic?.failures || [],
    extractionKind: r.extractionKind,
    currentEvidenceRows,
    nameEvidenceRows,
    rows: (r.rows || []).map((row) => ({
      ...row,
      qualityGateStatus: gateStatus,
      qualityGateReason: reason,
      sourceHost: hostOf(r.sourceUrl),
      sourceClass: source.class
    }))
  };
}

const input = readJson(IN_REL);
const gated = (input.results || []).map(classifyResult);
const acceptedRows = gated.filter((g) => ["verified","provisional","review"].includes(g.gateStatus)).flatMap((g) => g.rows);
const verifiedRows = gated.filter((g) => g.gateStatus === "verified").flatMap((g) => g.rows);

const sourceMemory = Object.values(gated.reduce((acc, g) => {
  const key = g.sourceHost || "missing";
  if (!acc[key]) {
    acc[key] = {
      sourceHost: key,
      sourceClass: g.sourceClass,
      sourceTrusted: g.sourceTrusted,
      extractedCompetitionCount: 0,
      verifiedCompetitionCount: 0,
      provisionalCompetitionCount: 0,
      reviewCompetitionCount: 0,
      rejectedCompetitionCount: 0,
      unresolvedCompetitionCount: 0,
      rowCount: 0,
      competitions: []
    };
  }
  acc[key].extractedCompetitionCount += g.rowCount > 0 ? 1 : 0;
  acc[key].verifiedCompetitionCount += g.gateStatus === "verified" ? 1 : 0;
  acc[key].provisionalCompetitionCount += g.gateStatus === "provisional" ? 1 : 0;
  acc[key].reviewCompetitionCount += g.gateStatus === "review" ? 1 : 0;
  acc[key].rejectedCompetitionCount += g.gateStatus === "rejected" ? 1 : 0;
  acc[key].unresolvedCompetitionCount += g.gateStatus === "unresolved" ? 1 : 0;
  acc[key].rowCount += g.rowCount || 0;
  acc[key].competitions.push({
    competitionSlug: g.competitionSlug,
    name: g.name,
    gateStatus: g.gateStatus,
    reason: g.reason,
    rowCount: g.rowCount,
    sourceUrl: g.sourceUrl
  });
  return acc;
}, {})).sort((a, b) =>
  b.verifiedCompetitionCount - a.verifiedCompetitionCount ||
  b.provisionalCompetitionCount - a.provisionalCompetitionCount ||
  b.rowCount - a.rowCount
);

const summary = {
  status: "passed",
  gate: "source_agnostic_standings_quality_gate",
  sourceInput: IN_REL,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  inputTargetCompetitionCount: input.summary?.targetCompetitionCount ?? null,
  inputUsableStandingsLeagueCount: input.summary?.usableStandingsLeagueCount ?? null,
  inputTotalStandingRowCount: input.summary?.totalStandingRowCount ?? null,
  gatedCompetitionCount: gated.length,
  verifiedCompetitionCount: gated.filter((g) => g.gateStatus === "verified").length,
  provisionalCompetitionCount: gated.filter((g) => g.gateStatus === "provisional").length,
  reviewCompetitionCount: gated.filter((g) => g.gateStatus === "review").length,
  rejectedCompetitionCount: gated.filter((g) => g.gateStatus === "rejected").length,
  unresolvedCompetitionCount: gated.filter((g) => g.gateStatus === "unresolved").length,
  acceptedCandidateCompetitionCount: gated.filter((g) => ["verified","provisional","review"].includes(g.gateStatus)).length,
  acceptedCandidateRowCount: acceptedRows.length,
  verifiedRowCount: verifiedRows.length,
  sourceHostCount: sourceMemory.length,
  reusableSourceHostCandidateCount: sourceMemory.filter((s) => s.verifiedCompetitionCount + s.provisionalCompetitionCount + s.reviewCompetitionCount >= 1 && s.sourceTrusted).length,
  verifiedCompetitionSlugs: gated.filter((g) => g.gateStatus === "verified").map((g) => g.competitionSlug),
  provisionalCompetitionSlugs: gated.filter((g) => g.gateStatus === "provisional").map((g) => g.competitionSlug),
  reviewCompetitionSlugs: gated.filter((g) => g.gateStatus === "review").map((g) => g.competitionSlug),
  rejectedExtractedCompetitionSlugs: gated.filter((g) => g.gateStatus === "rejected" && g.rowCount > 0).map((g) => g.competitionSlug),
  recommendedNextLane: "rerun_source_agnostic_discovery_with_source_memory_and_low_trust_host_suppression"
};

const outPath = path.join(OUT_DIR, `source-agnostic-standings-quality-gate-${DATE}.json`);
const compactPath = path.join(OUT_DIR, `source-agnostic-standings-quality-gate-summary-${DATE}.json`);
const sourceMemoryPath = path.join(OUT_DIR, `source-agnostic-source-memory-${DATE}.json`);
const acceptedRowsPath = path.join(OUT_DIR, `source-agnostic-accepted-standings-candidate-rows-${DATE}.jsonl`);
const verifiedRowsPath = path.join(OUT_DIR, `source-agnostic-verified-standings-rows-${DATE}.jsonl`);

fs.writeFileSync(outPath, `${JSON.stringify({ summary, gated, sourceMemory }, null, 2)}\n`, "utf8");
fs.writeFileSync(compactPath, `${JSON.stringify({
  summary,
  gated: gated.map((g) => ({
    competitionSlug: g.competitionSlug,
    name: g.name,
    country: g.country,
    gateStatus: g.gateStatus,
    reason: g.reason,
    rowCount: g.rowCount,
    arithmeticStatus: g.arithmeticStatus,
    sourceHost: g.sourceHost,
    sourceClass: g.sourceClass,
    sourceUrl: g.sourceUrl
  })),
  sourceMemory
}, null, 2)}\n`, "utf8");
fs.writeFileSync(sourceMemoryPath, `${JSON.stringify({ summary, sourceMemory }, null, 2)}\n`, "utf8");
fs.writeFileSync(acceptedRowsPath, acceptedRows.map((r) => JSON.stringify(r)).join("\n") + (acceptedRows.length ? "\n" : ""), "utf8");
fs.writeFileSync(verifiedRowsPath, verifiedRows.map((r) => JSON.stringify(r)).join("\n") + (verifiedRows.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  compactOutput: rel(compactPath),
  sourceMemoryOutput: rel(sourceMemoryPath),
  acceptedRowsOutput: rel(acceptedRowsPath),
  verifiedRowsOutput: rel(verifiedRowsPath),
  summary
}, null, 2));
