import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const batchArg = process.argv.find(arg => arg.startsWith("--batch="));
const batchIndex = Number(batchArg ? batchArg.split("=")[1] : 1);

const reuseBoardPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-explicit-route-reuse-board-${today}`, `bulk-batch-explicit-route-reuse-board-batch-${String(batchIndex).padStart(3, "0")}-${today}.json`);
const hygienePath = path.join(root, "data", "football-truth", "_diagnostics", `diagnostic-cooccurrence-hygiene-policy-${today}`, `diagnostic-cooccurrence-hygiene-policy-${today}.json`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-quality-board-${today}`);
const outPath = path.join(outDir, `bulk-batch-route-quality-board-batch-${String(batchIndex).padStart(3, "0")}-${today}.json`);
const rowsPath = path.join(outDir, `bulk-batch-route-quality-board-batch-${String(batchIndex).padStart(3, "0")}-rows-${today}.jsonl`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function shaText(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function hostOf(url) {
  try { return new URL(url).host.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function pathOf(url) {
  try { return new URL(url).pathname.toLowerCase(); } catch { return ""; }
}

function cleanUrl(url) {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (/^(__cf|cf_|utm_|gclid|fbclid|yclid|msclkid)/i.test(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return url;
  }
}

const allowed = {
  "eng.2": { hosts: ["efl.com"], must: /(championship|sky-bet-championship)/i },
  "eng.3": { hosts: ["efl.com"], must: /(league-one|sky-bet-league-one)/i },
  "eng.4": { hosts: ["efl.com"], must: /(league-two|sky-bet-league-two)/i },
  "fra.1": { hosts: ["ligue1.com"], must: /(ranking|fixtures|results|ligue-1|ligue1)/i },
  "fra.2": { hosts: ["ligue1.com"], must: /(ligue2|ligue-2|fixtures|results|ranking)/i },
  "ita.2": { hosts: ["legab.it"], must: /(classifica|calendario|risultati|serie-b|serieb|campionato)/i },
  "por.1": { hosts: ["ligaportugal.pt"], must: /(standings|classificacao|calendario|liga-portugal|ligaportugal(?!2))/i },
  "por.2": { hosts: ["ligaportugal.pt"], must: /(liga.*2|ligaportugal2|classificacao|standings|calendario)/i },
  "bel.1": { hosts: ["proleague.be"], must: /(standings|ranking|fixtures|jupiler|pro-league)/i },
  "bel.2": { hosts: ["proleague.be"], must: /(challenger|fixtures|standings|ranking)/i },
  "aut.1": { hosts: ["bundesliga.at"], must: /(tabelle|ranking|spielplan|bundesliga)/i },
  "aut.2": { hosts: ["2liga.at"], must: /(ranking|tabelle|spielplan|2liga|2-liga)/i },
  "sui.1": { hosts: ["sfl.ch"], must: /(standings|ranking|fixtures|super-league|superleague)/i },
  "sui.2": { hosts: ["sfl.ch"], must: /(standings|ranking|fixtures|challenge-league|challengeleague)/i },
  "pol.1": { hosts: ["ekstraklasa.org"], must: /(tabela|terminarz|fixtures|standings)/i },
  "pol.2": { hosts: ["1liga.org"], must: /(tabela|terminarz|fixtures|standings|i-liga|1liga)/i },
  "cze.1": { hosts: ["chanceliga.cz"], must: /(tabulka|zapasy|fixtures|standings)/i },
  "cze.2": { hosts: ["fotbal.cz", "fnliga.cz", "chanceliga.cz"], must: /(fnliga|f:nl|narodni-liga|tabulka|souteze|zapasy|fixtures|standings)/i, reject: /(repre|national|calendar)/i },
  "tur.1": { hosts: ["tff.org"], must: /(super-lig|standings|puan|fikstur|fixtures)/i },
  "tur.2": { hosts: ["tff.org"], must: /(1-lig|birinci|standings|puan|fikstur|fixtures)/i },
  "gre.1": { hosts: ["slgr.gr"], must: /(standings|fixtures|programma|ranking|vatmologia|βαθμολογ)/i },
  "gre.2": { hosts: ["sl2.gr"], must: /(fixtures|standings|programma|ranking|vatmologia|βαθμολογ)/i },
  "den.2": { hosts: ["dbu.dk", "division.dk"], must: /(1-division|nordicbet|stilling|kampprogram|fixtures|standings)/i },
  "usa.1": { hosts: ["mlssoccer.com"], must: /(standings|schedule|matches|fixtures)/i },
  "usa.2": { hosts: ["uslchampionship.com"], must: /(league-standings|schedule|matches|fixtures|standings)/i },
  "mex.1": { hosts: ["ligamx.net"], must: /(calendarios|tabla|estadistica|liga-mx|ligamx)/i },
  "mex.2": { hosts: ["ligamx.net"], must: /(ascenso|expansion|expansión|calendarios|tabla)/i },
  "bra.1": { hosts: ["cbf.com.br"], must: /(serie-a|brasileiro|standings|tabela|calendario|fixtures)/i },
  "bra.2": { hosts: ["cbf.com.br"], must: /(serie-b|brasileiro|standings|tabela|calendario|fixtures)/i },
  "arg.1": { hosts: ["afa.com.ar"], must: /(liga-profesional|primera|fixture|resultados|tabla)/i },
  "arg.2": { hosts: ["afa.com.ar"], must: /(primera-nacional|fixture|resultados|tabla)/i },
  "ksa.1": { hosts: ["spl.com.sa"], must: /(fixtures|standings|matches|table|دوري|ترتيب|مباريات)/i },
  "kor.1": { hosts: ["kleague.com"], must: /(match|standings|schedule|k-league-1|kleague1)/i },
  "kor.2": { hosts: ["kleague.com"], must: /(match|standings|schedule|k-league-2|kleague2)/i },
  "aus.1": { hosts: ["aleagues.com.au"], must: /(a-league-men|matches|fixtures|ladder|standings)/i },
  "aus.2": { hosts: ["footballaustralia.com.au", "footballnsw.com.au", "npl.tv"], must: /(national-second-tier|npl|fixtures|standings|ladder)/i },
  "chn.1": { hosts: ["thecfa.cn"], must: /(match|super-league|csl|standings|fixtures|league)/i },
  "chn.2": { hosts: ["thecfa.cn"], must: /(match|league-one|china-league-one|standings|fixtures|league)/i },
  "jpn.2": { hosts: ["jleague.co", "jleague.jp"], must: /(j2|matches|standings|fixtures)/i },
  "rou.1": { hosts: ["lpf.ro", "superliga.ro", "frf.ro"], must: /(superliga|liga-1|clasament|program|fixtures|standings)/i }
};

function urlIsBadGeneric(url) {
  const h = hostOf(url);
  const p = pathOf(url);
  const s = `${h}${p}`.toLowerCase();

  if (!h) return true;
  if (/bbc\.co\.uk|wikipedia\.org|facebook\.com|x\.com|twitter\.com|instagram\.com|youtube\.com/.test(h)) return true;
  if (/\/news\/?$|\/news$|\/en\/news\/?$|\/articles?\/?$|\/media\/?$/.test(p)) return true;
  if (/__cf_chl_tk|cf_chl|cloudflare/i.test(url)) return true;
  if (/spanish-la-liga|laliga/.test(s) && !/esp\./.test(s)) return true;
  if (/%3c|%3e|<|>/.test(url.toLowerCase())) return true;

  return false;
}

function classifyRouteKind(url) {
  const p = pathOf(url);
  if (/(standings|ranking|table|tabela|tabulka|tabelle|classifica|classificacao|clasament|puan|ladder|vatmologia|βαθμολογ)/i.test(p)) return "standings";
  if (/(fixtures|fixture|results|calendario|schedule|matches|match|spielplan|program|kampprogram|terminarz|zapasy|fikstur)/i.test(p)) return "fixtures_or_results";
  return "league_or_competition_page";
}

function evaluateUrl(slug, url) {
  const spec = allowed[slug];
  const cleaned = cleanUrl(url);
  const h = hostOf(cleaned);
  const candidateText = cleaned.toLowerCase();

  const reasons = [];
  if (!spec) reasons.push("missing_slug_quality_spec");
  if (urlIsBadGeneric(cleaned)) reasons.push("bad_generic_or_non_route_url");
  if (spec && !spec.hosts.some(host => h === host || h.endsWith(`.${host}`))) reasons.push("host_not_allowed_for_slug");
  if (spec?.reject && spec.reject.test(cleaned)) reasons.push("explicit_reject_pattern_matched");
  if (spec?.must && !spec.must.test(candidateText)) reasons.push("required_competition_or_route_pattern_missing");

  const routeKind = classifyRouteKind(cleaned);
  if (routeKind === "league_or_competition_page" && !/(\/standings|\/fixtures|\/matches|\/ranking|\/table|\/tabela|\/tabulka|\/classifica|\/clasament|\/match)/i.test(cleaned)) {
    reasons.push("route_kind_too_generic");
  }

  return {
    url: cleaned,
    host: h,
    routeKind,
    passed: reasons.length === 0,
    reasons
  };
}

function evaluateCandidate(slug, candidate) {
  const urlEvals = [];
  for (const url of candidate.urls || []) urlEvals.push(evaluateUrl(slug, url));

  const passedUrls = urlEvals.filter(item => item.passed);
  const bestPassed = passedUrls[0] || null;

  const candidateReasons = [];
  if ((candidate.sameObjectEvidence !== true) || (candidate.cooccurrenceOnly === true)) candidateReasons.push("not_same_object_explicit_evidence");
  if (passedUrls.length === 0) candidateReasons.push("no_url_passed_quality_gate");

  return {
    candidate,
    urlEvals,
    passed: candidateReasons.length === 0,
    candidateReasons,
    bestPassedUrl: bestPassed
  };
}

await fs.mkdir(outDir, { recursive: true });

const reuseBoard = JSON.parse(await fs.readFile(reuseBoardPath, "utf8"));
const hygiene = JSON.parse(await fs.readFile(hygienePath, "utf8"));
const blocks = [];

if (reuseBoard.status !== "passed") blocks.push("reuse_board_not_passed");
if (hygiene.status !== "passed") blocks.push("hygiene_policy_not_passed");
if (hygiene.ruleSet?.familyAssignmentRequiresPerSlugRouteEvidence !== true) blocks.push("hygiene_missing_per_slug_route_rule");
if (hygiene.ruleSet?.sourceFamilyMustBeExplicitFieldNotTextCooccurrence !== true) blocks.push("hygiene_missing_no_cooccurrence_rule");

const rows = (reuseBoard.rows || []).map(row => {
  const evaluated = (row.topCandidates || []).map(candidate => evaluateCandidate(row.slug, candidate));
  const bestPassed = evaluated.find(item => item.passed) || null;

  return {
    slug: row.slug,
    displayName: row.displayName,
    batchIndex,
    explicitRouteReuseCandidateCount: row.explicitRouteReuseCandidateCount,
    routeQualityStatus: bestPassed ? "ready_for_controlled_fetch_verification" : "needs_controlled_official_route_discovery",
    selectedUrl: bestPassed?.bestPassedUrl?.url || null,
    selectedHost: bestPassed?.bestPassedUrl?.host || null,
    selectedRouteKind: bestPassed?.bestPassedUrl?.routeKind || null,
    selectedEvidenceFile: bestPassed?.candidate?.file || null,
    selectedEvidenceSha256: bestPassed ? shaText(JSON.stringify(bestPassed.candidate)) : null,
    rejectedTopCandidateCount: evaluated.filter(item => !item.passed).length,
    rejectionReasons: [...new Set(evaluated.flatMap(item => item.candidateReasons.concat(item.urlEvals.flatMap(urlEval => urlEval.reasons))))].sort(),
    cooccurrenceOnlyEvidenceAccepted: false,
    familyClaimMadeNow: false,
    routeClaimMadeNow: false,
    fetchVerificationRequiredBeforeCandidateWrite: true,
    fetchAllowedByThisBoard: false,
    productionWriteAllowedByThisBoard: false,
    truthAssertionAllowedByThisBoard: false,
    evaluatedTopCandidates: evaluated.map(item => ({
      file: item.candidate.file,
      urls: item.urlEvals,
      candidatePassed: item.passed,
      candidateReasons: item.candidateReasons
    }))
  };
});

if (rows.length !== 40) blocks.push("row_count_not_40");
if (rows.some(row => row.cooccurrenceOnlyEvidenceAccepted !== false)) blocks.push("cooccurrence_evidence_accepted");
if (rows.some(row => row.familyClaimMadeNow !== false || row.routeClaimMadeNow !== false)) blocks.push("family_or_route_claim_made_now");

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "bulk_batch_route_quality_board",
  contractVersion: 1,
  batchIndex,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  reuseBoardPath: rel(reuseBoardPath),
  hygienePath: rel(hygienePath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    providerFetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    batchIndex,
    targetCount: rows.length,
    readyForControlledFetchVerificationCount: rows.filter(row => row.routeQualityStatus === "ready_for_controlled_fetch_verification").length,
    needsControlledOfficialRouteDiscoveryCount: rows.filter(row => row.routeQualityStatus === "needs_controlled_official_route_discovery").length,
    rejectedOrNeedsDiscoverySlugs: rows.filter(row => row.routeQualityStatus !== "ready_for_controlled_fetch_verification").map(row => row.slug),
    cooccurrenceOnlyEvidenceAcceptedCount: 0,
    familyClaimMadeNowCount: 0,
    routeClaimMadeNowCount: 0,
    nextRecommendedLane: "controlled_fetch_verification_for_ready_routes_then_discovery_for_rejected_slugs"
  },
  rows,
  blocks
};

await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  rows: report.rows.map(row => ({
    slug: row.slug,
    displayName: row.displayName,
    routeQualityStatus: row.routeQualityStatus,
    selectedHost: row.selectedHost,
    selectedRouteKind: row.selectedRouteKind,
    selectedUrl: row.selectedUrl,
    selectedEvidenceFile: row.selectedEvidenceFile,
    rejectionReasons: row.rejectionReasons
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
