import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const inputPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-no-current-batch001-local-evidence-discovery-${today}`, `football-truth-global-no-current-batch001-local-evidence-discovery-${today}.json`);
const inputRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-no-current-batch001-local-evidence-discovery-${today}`, `football-truth-global-no-current-batch001-local-evidence-discovery-rows-${today}.jsonl`);
const inputVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-no-current-batch001-local-evidence-discovery-verification-${today}`, `football-truth-global-no-current-batch001-local-evidence-discovery-verification-${today}.json`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-strict-precision-audit-${today}`);
const outPath = path.join(outDir, `football-truth-global-batch001-strict-precision-audit-${today}.json`);
const rowsPath = path.join(outDir, `football-truth-global-batch001-strict-precision-audit-rows-${today}.jsonl`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
function uniq(values) { return [...new Set((values || []).filter(Boolean))]; }
function sorted(values) { return uniq(values).sort((a,b) => a.localeCompare(b)); }
function country(slug) { return String(slug || "").split(".")[0]; }
function level(slug) { return Number.parseInt(String(slug || "").split(".")[1] || "99", 10); }
function shaText(text) { return crypto.createHash("sha256").update(String(text || "")).digest("hex"); }

const officialHostsByCountry = {
  arg: ["afa.com.ar"],
  aus: ["aleagues.com.au", "footballaustralia.com.au", "australia.football"],
  aut: ["bundesliga.at", "2liga.at", "oefb.at"],
  bel: ["proleague.be", "rbfa.be"],
  bra: ["cbf.com.br"],
  cyp: ["cfa.com.cy"],
  cze: ["chanceliga.cz", "fnliga.cz", "fotbal.cz"],
  fin: ["palloliitto.fi", "veikkausliiga.com", "ykkosliiga.fi"],
  fra: ["ligue1.fr", "ligue2.fr", "lfp.fr", "fff.fr"],
  gre: ["slgr.gr", "epo.gr"],
  kor: ["kleague.com", "kfa.or.kr"],
  mex: ["ligamx.net", "fmf.mx"],
  nor: ["fotball.no", "eliteserien.no", "ntf.no"],
  pol: ["ekstraklasa.org", "1liga.org", "pzpn.pl"],
  por: ["ligaportugal.pt", "fpf.pt"],
  sui: ["sfl.ch", "football.ch"],
  tur: ["tff.org"],
  ukr: ["upl.ua", "uaf.ua"],
  usa: ["mlssoccer.com", "uslsoccer.com", "ussoccer.com"],
  wal: ["faw.cymru"],
  bul: ["bfunion.bg", "fpleague.bg"],
  hun: ["mlsz.hu"],
  svn: ["nzs.si"],
  chn: ["thecfa.cn"],
  svk: ["futbalsfz.sk", "nike-liga.sk"],
  rou: ["lpf.ro", "frf.ro"],
  mys: ["fam.org.my", "malaysianfootballleague.com", "mfl.my"],
  tha: ["thaileague.co.th"],
  cro: ["hnl.com.hr", "hns.family", "semafor.hns.family"],
  den: ["dbu.dk", "divisionsforeningen.dk", "superliga.dk"],
  eng: ["efl.com", "premierleague.com"],
  ita: ["legab.it", "legaseriea.it", "figc.it"],
  ned: ["knvb.nl", "eredivisie.nl", "keukenkampioendivisie.nl"],
  ksa: ["saff.com.sa", "spl.com.sa", "yallakora.com.sa"],
  per: ["liga1.pe", "liga2.pe", "fpf.org.pe"],
  srb: ["superliga.rs", "prvaliga.rs", "fss.rs"],
  ind: ["the-aiff.com", "indiansuperleague.com"],
  alb: ["fshf.org"],
  arm: ["ffa.am"],
  aze: ["affa.az", "pfl.az"],
  bih: ["nfsbih.ba"],
  blr: ["abff.by"],
  geo: ["gff.ge", "erovnuliliga.ge"],
  irl: ["leagueofireland.ie", "fai.ie"],
  alg: ["faf.dz", "lnfp.dz"],
  est: ["jalgpall.ee"],
  lva: ["lff.lv"],
  mda: ["fmf.md"],
  mkd: ["ffm.mk"],
  mne: ["fscg.me"],
  qat: ["qsl.qa", "qfa.qa"],
  ltu: ["lff.lt"],
  egy: ["efa.com.eg"],
  gha: ["ghanafa.org"]
};

const nonOfficialHosts = [
  "lequipe.fr", "espn.nl", "skysports.com", "ole.com.ar", "supersport.com", "arriyadiyah.com",
  "wikipedia.org", "wikidata.org", "transfermarkt.com", "sofascore.com", "flashscore.com", "livescore.com",
  "worldfootball.net", "rsssf.org", "facebook.com", "twitter.com", "x.com", "instagram.com", "youtube.com"
];

const hardContaminantHostRules = {
  "the-aiff.com": ["ind"],
  "indiansuperleague.com": ["ind"],
  "efl.com": ["eng"],
  "laliga.com": ["esp"],
  "bundesliga.com": ["ger"],
  "bundesliga.at": ["aut"],
  "2liga.at": ["aut"],
  "cfa.com.cy": ["cyp"],
  "slgr.gr": ["gre"],
  "proleague.be": ["bel"],
  "hnl.com.hr": ["cro"],
  "hns.family": ["cro"],
  "semafor.hns.family": ["cro"],
  "fai.ie": ["irl"],
  "leagueofireland.ie": ["irl"],
  "afa.com.ar": ["arg"]
};

function hostMatches(host, allowed) {
  return (allowed || []).some(a => host === a || host.endsWith(`.${a}`));
}

function isNonOfficial(host) {
  return nonOfficialHosts.some(h => host === h || host.endsWith(`.${h}`));
}

function contaminantRuleViolation(slug, host) {
  for (const [h, countries] of Object.entries(hardContaminantHostRules)) {
    if (host === h || host.endsWith(`.${h}`)) {
      return !countries.includes(country(slug));
    }
  }
  return false;
}

function wrongLeagueTitle(slug, title, finalUrl) {
  const text = `${title || ""} ${finalUrl || ""}`.toLowerCase();
  if (slug === "eng.2" && /league two/.test(text)) return true;
  if (slug === "eng.3" && /league two/.test(text)) return true;
  if (slug === "cro.2" && /supersport hnl/.test(text)) return true;
  if (slug === "per.2" && /liga1|liga 1/.test(text)) return true;
  if (slug === "arg.2" && /ole\.com|ole -/.test(text)) return true;
  return false;
}

function lowValueSurface(title, finalUrl, apiHintCount, tableCount, trCount) {
  const text = `${title || ""} ${finalUrl || ""}`.toLowerCase();
  if (/404|page not found|not found|news|nieuws|actualit|latest news|τελευταίες ειδήσεις/.test(text)) return true;
  if ((apiHintCount || 0) < 10 && (tableCount || 0) === 0 && (trCount || 0) === 0) return true;
  return false;
}

function classify(row, selectedHostFrequency) {
  const slug = row.slug;
  const c = country(slug);
  const host = row.selectedHost || "";
  const status = row.discoveryStatus;
  const fetchStatus = Number(row.selectedFetchStatus || 0);
  const allowed = officialHostsByCountry[c] || [];
  const flags = [];

  if (status !== "controlled_route_candidate_passed") {
    return {
      strictPrecisionLane: status === "controlled_route_candidate_needs_review" ? "input_needs_review_not_accepted" : "input_not_found_or_failed",
      strictAcceptedForNextGate: false,
      flags: ["input_not_passed", status]
    };
  }

  if (!(fetchStatus >= 200 && fetchStatus < 400)) flags.push("bad_fetch_status");
  if (row.selectedHasChallenge === true) flags.push("challenge_page");
  if (isNonOfficial(host)) flags.push("non_official_or_media_host");
  if (contaminantRuleViolation(slug, host)) flags.push("known_cross_country_contaminant_host");
  if (!hostMatches(host, allowed)) flags.push("host_not_in_country_official_allowlist");
  if (wrongLeagueTitle(slug, row.selectedTitle, row.selectedFinalUrl)) flags.push("wrong_league_or_level_title");
  if ((selectedHostFrequency.get(host) || 0) >= 8 && !hostMatches(host, allowed)) flags.push("high_frequency_contaminant_host");
  if (lowValueSurface(row.selectedTitle, row.selectedFinalUrl, row.selectedApiHintCount, row.selectedTableCount, row.selectedTrCount)) flags.push("low_value_or_non_standings_surface");

  if (flags.includes("bad_fetch_status") || flags.includes("challenge_page")) {
    return { strictPrecisionLane: "strict_rejected_fetch_or_challenge", strictAcceptedForNextGate: false, flags };
  }

  if (flags.includes("non_official_or_media_host")) {
    return { strictPrecisionLane: "strict_rejected_non_official_or_media", strictAcceptedForNextGate: false, flags };
  }

  if (flags.includes("known_cross_country_contaminant_host") || flags.includes("host_not_in_country_official_allowlist") || flags.includes("high_frequency_contaminant_host")) {
    return { strictPrecisionLane: "strict_rejected_wrong_country_or_contaminant_host", strictAcceptedForNextGate: false, flags };
  }

  if (flags.includes("wrong_league_or_level_title")) {
    return { strictPrecisionLane: "strict_review_official_host_wrong_league_or_level", strictAcceptedForNextGate: false, flags };
  }

  if (flags.includes("low_value_or_non_standings_surface")) {
    return { strictPrecisionLane: "strict_review_official_host_low_value_surface", strictAcceptedForNextGate: false, flags };
  }

  return {
    strictPrecisionLane: "strict_official_route_candidate_needs_identity_surface_gate",
    strictAcceptedForNextGate: true,
    flags
  };
}

await fs.mkdir(outDir, { recursive: true });

const blocks = [];
const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
const inputRows = parseJsonl(await fs.readFile(inputRowsPath, "utf8"));
const inputVerification = JSON.parse(await fs.readFile(inputVerificationPath, "utf8"));

if (input.status !== "passed") blocks.push("input_not_passed");
if (inputVerification.status !== "passed") blocks.push("input_verification_not_passed");
if (input.summary?.targetCount !== 80) blocks.push("target_count_not_80");
if (inputRows.length !== 80) blocks.push("input_rows_not_80");
if (input.summary?.discoveryStatusCounts?.controlled_route_candidate_passed !== 74) blocks.push("expected_inflated_pass_count_74_not_found");

const selectedHostFrequency = new Map();
for (const row of inputRows) {
  if (!row.selectedHost) continue;
  selectedHostFrequency.set(row.selectedHost, (selectedHostFrequency.get(row.selectedHost) || 0) + 1);
}

const rows = inputRows.map(row => {
  const strict = classify(row, selectedHostFrequency);
  return {
    slug: row.slug,
    displayName: row.displayName,
    inputDiscoveryStatus: row.discoveryStatus,
    inputSelectedHost: row.selectedHost,
    inputSelectedUrl: row.selectedUrl,
    inputSelectedFinalUrl: row.selectedFinalUrl,
    inputSelectedTitle: row.selectedTitle,
    inputSelectedFetchStatus: row.selectedFetchStatus,
    inputSelectedFetchedScore: row.selectedFetchedScore,
    inputSelectedTableCount: row.selectedTableCount,
    inputSelectedTrCount: row.selectedTrCount,
    inputSelectedApiHintCount: row.selectedApiHintCount,
    inputSelectedHasChallenge: row.selectedHasChallenge,
    selectedHostFrequency: selectedHostFrequency.get(row.selectedHost) || 0,
    strictPrecisionLane: strict.strictPrecisionLane,
    strictAcceptedForNextGate: strict.strictAcceptedForNextGate,
    strictFlags: strict.flags,
    country: country(row.slug),
    level: level(row.slug),
    expectedOfficialHosts: officialHostsByCountry[country(row.slug)] || [],
    nextAction: strict.strictAcceptedForNextGate
      ? "send to identity/surface gate; still not coverage"
      : "do not advance; park/review according to strict lane",
    acceptedNow: false,
    routeClaimMadeNow: false,
    familyClaimMadeNow: false,
    canonicalWriteExecutedNow: false,
    lifecycleWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    truthAssertionExecutedNow: false,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  };
});

const strictLaneCounts = rows.reduce((acc, row) => {
  acc[row.strictPrecisionLane] = (acc[row.strictPrecisionLane] || 0) + 1;
  return acc;
}, {});

const strictAcceptedSlugs = rows.filter(row => row.strictAcceptedForNextGate).map(row => row.slug);
const strictRejectedSlugs = rows.filter(row => !row.strictAcceptedForNextGate).map(row => row.slug);

const hostFrequency = Object.fromEntries([...selectedHostFrequency.entries()].sort((a,b) => b[1] - a[1]));

const audit = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "global_batch001_strict_precision_audit",
  contractVersion: 1,
  generatedAt: new Date().toISOString(),
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  inputPath: rel(inputPath),
  inputRowsPath: rel(inputRowsPath),
  inputVerificationPath: rel(inputVerificationPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    routeClaimMadeNowCount: 0,
    familyClaimMadeNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  precisionPolicy: {
    officialHostAllowlistRequired: true,
    nonOfficialMediaRejected: true,
    knownCrossCountryContaminantHostsRejected: true,
    routeCandidateStillNotCoverage: true,
    identitySurfaceGateRequiredAfterStrictAcceptance: true,
    extractionAndSeasonLifecycleGatesRequiredAfterIdentitySurface: true
  },
  summary: {
    targetCount: rows.length,
    inputInflatedPassCount: input.summary?.discoveryStatusCounts?.controlled_route_candidate_passed || 0,
    strictAcceptedForNextGateCount: strictAcceptedSlugs.length,
    strictRejectedOrReviewCount: strictRejectedSlugs.length,
    strictLaneCounts,
    strictAcceptedSlugs,
    strictRejectedSlugs,
    topSelectedHostFrequency: hostFrequency,
    falsePositiveInflationDetected: strictAcceptedSlugs.length < (input.summary?.discoveryStatusCounts?.controlled_route_candidate_passed || 0),
    nextRecommendedLane: "run identity/surface only on strictAcceptedSlugs; do not use inflated passedSlugs"
  },
  rows,
  blocks
};

await fs.writeFile(outPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: audit.status,
  output: audit.output,
  rowsOutput: audit.rowsOutput,
  guardrails: audit.guardrails,
  summary: audit.summary,
  blocks: audit.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
