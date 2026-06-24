import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");
const batchArg = process.argv.find(arg => arg.startsWith("--batch="));
const batchIndex = Number(batchArg ? batchArg.split("=")[1] : 2);
const pad = String(batchIndex).padStart(3, "0");

const qualityPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-quality-board-${today}`, `bulk-batch-route-quality-board-batch-${pad}-${today}.json`);
const qualityRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-quality-board-${today}`, `bulk-batch-route-quality-board-batch-${pad}-rows-${today}.jsonl`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-controlled-official-route-discovery-${today}`);
const outPath = path.join(outDir, `bulk-batch-controlled-official-route-discovery-batch-${pad}-${today}.json`);
const rowsPath = path.join(outDir, `bulk-batch-controlled-official-route-discovery-batch-${pad}-rows-${today}.jsonl`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function shaText(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function hostOf(url) {
  try { return new URL(url).host.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function titleOf(html) {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return String(m?.[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
}

function countTermHits(text, terms) {
  const lower = String(text || "").toLowerCase();
  return terms.filter(term => lower.includes(String(term).toLowerCase())).length;
}

function hasAny(text, terms) {
  return countTermHits(text, terms) > 0;
}

async function fetchWithTimeout(url, timeoutMs = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AI-MatchLab-FootballTruth/1.0; +controlled-official-route-discovery)",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
        "accept-language": "en-US,en;q=0.9"
      }
    });
    const text = await response.text();
    clearTimeout(timer);
    return { response, text, error: null, timedOut: false };
  } catch (error) {
    clearTimeout(timer);
    return { response: null, text: "", error: String(error?.name || error?.message || error), timedOut: String(error?.name || "") === "AbortError" };
  }
}

const routeTerms = [
  "standings", "table", "ranking", "fixtures", "results", "matches", "schedule", "classification",
  "tabela", "tabulka", "clasament", "classifica", "tabelle", "lestvica", "raspored", "rezultati",
  "competition", "championship", "league", "premier", "liga"
];

const specs = {
  "rou.2": {
    hosts: ["frf.ro", "frfotbal.ro"],
    terms: ["liga 2", "liga ii", "casa pariurilor", "romania"],
    urls: [
      "https://www.frf.ro/competitii/competitii-masculin/liga-2-casa-pariurilor/",
      "https://www.frf.ro/competitii/",
      "https://frfotbal.ro/"
    ]
  },
  "hun.1": {
    hosts: ["mlsz.hu", "adatbank.mlsz.hu"],
    terms: ["nb i", "otp bank liga", "hungary", "magyar"],
    urls: [
      "https://adatbank.mlsz.hu/",
      "https://www.mlsz.hu/fixtures",
      "https://mlsz.hu/fixtures"
    ]
  },
  "hun.2": {
    hosts: ["mlsz.hu", "adatbank.mlsz.hu"],
    terms: ["nb ii", "merkantil", "hungary", "magyar"],
    urls: [
      "https://adatbank.mlsz.hu/",
      "https://www.mlsz.hu/fixtures",
      "https://mlsz.hu/fixtures"
    ]
  },
  "srb.1": {
    hosts: ["superliga.rs"],
    terms: ["super liga", "superliga", "serbia", "mozart"],
    urls: [
      "https://www.superliga.rs/",
      "https://www.superliga.rs/tabela",
      "https://superliga.rs/tabela"
    ]
  },
  "srb.2": {
    hosts: ["prvaliga.rs"],
    terms: ["prva liga", "serbia", "tabela"],
    urls: [
      "https://www.prvaliga.rs/",
      "https://www.prvaliga.rs/tabela",
      "https://prvaliga.rs/tabela"
    ]
  },
  "svn.1": {
    hosts: ["prvaliga.si", "nzs.si"],
    terms: ["prvaliga", "prva liga", "slovenia", "lestvica"],
    urls: [
      "https://www.prvaliga.si/",
      "https://www.prvaliga.si/tekmovanja/default.asp?action=lestvica",
      "https://www.nzs.si/tekmovanja/"
    ]
  },
  "svn.2": {
    hosts: ["nzs.si"],
    terms: ["2. snl", "druga", "slovenia", "lestvica"],
    urls: [
      "https://www.nzs.si/tekmovanja/",
      "https://www.nzs.si/tekmovanja/default.asp?action=lestvica"
    ]
  },
  "svk.1": {
    hosts: ["nikeliga.sk", "futbalsfz.sk"],
    terms: ["nike liga", "fortuna liga", "slovakia", "tabulka"],
    urls: [
      "https://www.nikeliga.sk/tabulka",
      "https://www.nikeliga.sk/",
      "https://futbalsfz.sk/fixtures/"
    ]
  },
  "svk.2": {
    hosts: ["futbalsfz.sk"],
    terms: ["2. liga", "monacobet", "slovakia", "tabulka"],
    urls: [
      "https://futbalsfz.sk/fixtures/",
      "https://futbalsfz.sk/sutaze/"
    ]
  },
  "bul.1": {
    hosts: ["bfunion.bg"],
    terms: ["first league", "parva liga", "efbet", "bulgaria"],
    urls: [
      "https://bfunion.bg/competition/parva-liga/",
      "https://bfunion.bg/fixtures",
      "https://bfunion.bg/"
    ]
  },
  "bul.2": {
    hosts: ["bfunion.bg"],
    terms: ["second league", "vtora liga", "bulgaria"],
    urls: [
      "https://bfunion.bg/competition/vtora-liga/",
      "https://bfunion.bg/fixtures",
      "https://bfunion.bg/"
    ]
  },
  "ukr.1": {
    hosts: ["upl.ua"],
    terms: ["premier league", "ukraine", "championship", "table"],
    urls: [
      "https://upl.ua/en/tournaments/championship/table",
      "https://upl.ua/en/tournaments/championship",
      "https://upl.ua/ua/tournaments/championship/table"
    ]
  },
  "ukr.2": {
    hosts: ["pfl.ua"],
    terms: ["first league", "persha liga", "ukraine", "table"],
    urls: [
      "https://pfl.ua/competition/first-league",
      "https://pfl.ua/",
      "https://pfl.ua/tournament"
    ]
  },
  "rus.1": {
    hosts: ["premierliga.ru"],
    terms: ["premier league", "russia", "championship", "table"],
    urls: [
      "https://premierliga.ru/tournaments/championship/table",
      "https://premierliga.ru/tournaments/championship",
      "https://premierliga.ru/"
    ]
  },
  "rus.2": {
    hosts: ["1fnl.ru", "fnl.pro"],
    terms: ["first league", "fnl", "russia", "table"],
    urls: [
      "https://1fnl.ru/champioship/table",
      "https://1fnl.ru/championship/table",
      "https://fnl.pro/"
    ]
  },
  "alb.1": {
    hosts: ["fshf.org"],
    terms: ["superiore", "superliga", "albania", "abissnet"],
    urls: [
      "https://fshf.org/garat?query=matches",
      "https://fshf.org/garat/",
      "https://fshf.org/"
    ]
  },
  "alb.2": {
    hosts: ["fshf.org"],
    terms: ["kategoria e pare", "first division", "albania"],
    urls: [
      "https://fshf.org/garat?query=matches",
      "https://fshf.org/garat/",
      "https://fshf.org/"
    ]
  },
  "arm.1": {
    hosts: ["ffa.am"],
    terms: ["premier league", "armenian", "armenia"],
    urls: [
      "https://www.ffa.am/en/competitions/armenian-premier-league",
      "https://ffa.am/fixtures",
      "https://www.ffa.am/en"
    ]
  },
  "arm.2": {
    hosts: ["ffa.am"],
    terms: ["first league", "armenian", "armenia"],
    urls: [
      "https://www.ffa.am/en/competitions/armenian-first-league",
      "https://ffa.am/fixtures",
      "https://www.ffa.am/en"
    ]
  },
  "aze.1": {
    hosts: ["pfl.az", "affa.az"],
    terms: ["premyer liqa", "premier league", "azerbaijan"],
    urls: [
      "https://www.pfl.az/",
      "https://www.pfl.az/tournaments/premyer-liqa",
      "https://www.affa.az/"
    ]
  },
  "aze.2": {
    hosts: ["pfl.az", "affa.az"],
    terms: ["first division", "i liqa", "azerbaijan"],
    urls: [
      "https://www.pfl.az/",
      "https://www.affa.az/"
    ]
  },
  "bih.1": {
    hosts: ["nfsbih.ba"],
    terms: ["premijer liga", "bosnia", "wwin"],
    urls: [
      "https://www.nfsbih.ba/takmicenja/premijer-liga-bih/",
      "https://www.nfsbih.ba/fixtures/",
      "https://nfsbih.ba/fixtures"
    ]
  },
  "bih.2": {
    hosts: ["nfsbih.ba"],
    terms: ["prva liga", "first league", "bosnia"],
    urls: [
      "https://www.nfsbih.ba/takmicenja/",
      "https://www.nfsbih.ba/fixtures/",
      "https://nfsbih.ba/fixtures"
    ]
  },
  "blr.1": {
    hosts: ["abff.by"],
    terms: ["highest league", "premier league", "belarus"],
    urls: [
      "https://abff.by/en/competitions/men/belarusbank-highest-league/",
      "https://abff.by/competitions/men/belarusbank-highest-league/",
      "https://abff.by/fixtures"
    ]
  },
  "blr.2": {
    hosts: ["abff.by"],
    terms: ["first league", "belarus"],
    urls: [
      "https://abff.by/en/competitions/men/first-league/",
      "https://abff.by/fixtures"
    ]
  },
  "est.1": {
    hosts: ["jalgpall.ee"],
    terms: ["premium liiga", "meistriliiga", "estonia"],
    urls: [
      "https://jalgpall.ee/voistlused/1/premium-liiga",
      "https://jalgpall.ee/voistlused",
      "https://jalgpall.ee/"
    ]
  },
  "est.2": {
    hosts: ["jalgpall.ee"],
    terms: ["esiliiga", "estonia"],
    urls: [
      "https://jalgpall.ee/voistlused/2/esiliiga",
      "https://jalgpall.ee/voistlused",
      "https://jalgpall.ee/"
    ]
  },
  "lva.1": {
    hosts: ["optibetvirsliga.com", "lff.lv"],
    terms: ["virsliga", "latvia"],
    urls: [
      "https://optibetvirsliga.com/",
      "https://lff.lv/sacensibas/viriesi/virsliga/",
      "https://lff.lv/"
    ]
  },
  "lva.2": {
    hosts: ["lff.lv"],
    terms: ["1. liga", "first league", "latvia"],
    urls: [
      "https://lff.lv/sacensibas/viriesi/1-liga/",
      "https://lff.lv/sacensibas/",
      "https://lff.lv/"
    ]
  },
  "ltu.1": {
    hosts: ["alyga.lt"],
    terms: ["a lyga", "lithuania"],
    urls: [
      "https://alyga.lt/",
      "https://alyga.lt/tvarkarastis",
      "https://alyga.lt/turnyrine-lentele"
    ]
  },
  "ltu.2": {
    hosts: ["1lyga.lt", "lff.lt"],
    terms: ["i lyga", "1 lyga", "lithuania"],
    urls: [
      "https://www.1lyga.lt/",
      "https://1lyga.lt/",
      "https://lff.lt/"
    ]
  },
  "mda.1": {
    hosts: ["fmf.md"],
    terms: ["super liga", "moldova"],
    urls: [
      "https://fmf.md/competitions/super-liga",
      "https://fmf.md/home/meciuri-info",
      "https://fmf.md/"
    ]
  },
  "mda.2": {
    hosts: ["fmf.md"],
    terms: ["liga 1", "moldova"],
    urls: [
      "https://fmf.md/competitions/liga-1",
      "https://fmf.md/home/meciuri-info",
      "https://fmf.md/"
    ]
  },
  "mkd.1": {
    hosts: ["ffm.mk"],
    terms: ["first mfl", "first league", "macedonia"],
    urls: [
      "https://ffm.mk/en/first-mfl",
      "https://www.ffm.mk/en/fixtures",
      "https://ffm.mk/"
    ]
  },
  "mkd.2": {
    hosts: ["ffm.mk"],
    terms: ["second mfl", "second league", "macedonia"],
    urls: [
      "https://ffm.mk/en/second-mfl",
      "https://www.ffm.mk/en/fixtures",
      "https://ffm.mk/"
    ]
  },
  "mne.1": {
    hosts: ["fscg.me"],
    terms: ["1. cfl", "first league", "montenegro", "meridianbet"],
    urls: [
      "https://fscg.me/takmicenja/meridianbet-1-cfl/",
      "https://fscg.me/fixtures/",
      "https://fscg.me/"
    ]
  },
  "mne.2": {
    hosts: ["fscg.me"],
    terms: ["2. cfl", "second league", "montenegro"],
    urls: [
      "https://fscg.me/takmicenja/2-cfl/",
      "https://fscg.me/fixtures/",
      "https://fscg.me/"
    ]
  },
  "irl.1": {
    hosts: ["leagueofireland.ie"],
    terms: ["premier division", "sse airtricity", "ireland"],
    urls: [
      "https://www.leagueofireland.ie/mens/sse-airtricity-mens-premier-division/fixtures/",
      "https://www.leagueofireland.ie/mens/sse-airtricity-mens-premier-division/table/",
      "https://www.leagueofireland.ie/"
    ]
  },
  "irl.2": {
    hosts: ["leagueofireland.ie"],
    terms: ["first division", "sse airtricity", "ireland"],
    urls: [
      "https://www.leagueofireland.ie/mens/sse-airtricity-mens-first-division/fixtures/",
      "https://www.leagueofireland.ie/mens/sse-airtricity-mens-first-division/table/",
      "https://www.leagueofireland.ie/"
    ]
  },
  "wal.1": {
    hosts: ["faw.cymru", "cymrufootball.wales"],
    terms: ["cymru premier", "wales"],
    urls: [
      "https://faw.cymru/cymru-leagues/cymru-premier/fixtures",
      "https://faw.cymru/cymru-leagues/cymru-premier/table",
      "https://cymrufootball.wales/cymru-premier/fixtures"
    ]
  }
};

function scoreAttempt(spec, attempt) {
  if (attempt.fetchError || attempt.timedOut) return { score: -100, passed: false, blocks: ["fetch_error_or_timeout"] };
  const blocks = [];
  const statusOk = attempt.fetchStatus >= 200 && attempt.fetchStatus < 400;
  if (!statusOk) blocks.push("status_not_2xx_or_3xx");

  const finalHost = hostOf(attempt.finalUrl);
  const hostAllowed = spec.hosts.some(host => finalHost === host || finalHost.endsWith(`.${host}`));
  if (!hostAllowed) blocks.push("final_host_not_allowed");

  if (attempt.hasAccessDenied || attempt.hasCloudflareChallenge) blocks.push("access_denied_or_challenge");
  if (attempt.bodyLength < 500) blocks.push("body_too_short");

  const text = `${attempt.url} ${attempt.finalUrl} ${attempt.title} ${attempt.bodySample}`;
  const competitionHits = countTermHits(text, spec.terms);
  const routeHits = countTermHits(text, routeTerms);
  if (competitionHits === 0) blocks.push("competition_terms_not_found");
  if (routeHits === 0) blocks.push("route_terms_not_found");

  let score = 0;
  if (statusOk) score += 100;
  if (hostAllowed) score += 100;
  score += Math.min(competitionHits, 5) * 25;
  score += Math.min(routeHits, 8) * 12;
  if (/standings|table|fixtures|results|matches|schedule|tabela|tabulka|clasament|classifica|lestvica/i.test(attempt.finalUrl)) score += 60;
  if (/standings|table|fixtures|results|matches|schedule|tabela|tabulka|clasament|classifica|lestvica/i.test(attempt.title)) score += 40;
  if (attempt.bodyLength > 50000) score += 25;
  if (attempt.url === attempt.finalUrl) score += 10;
  if (blocks.includes("access_denied_or_challenge")) score -= 120;
  if (blocks.includes("competition_terms_not_found")) score -= 60;
  if (blocks.includes("route_terms_not_found")) score -= 30;

  return {
    score,
    passed: blocks.length === 0 && score >= 200,
    blocks,
    competitionHits,
    routeHits
  };
}

await fs.mkdir(outDir, { recursive: true });

const quality = JSON.parse(await fs.readFile(qualityPath, "utf8"));
const qualityRows = parseJsonl(await fs.readFile(qualityRowsPath, "utf8"));
const blocks = [];

if (!allowFetch) blocks.push("missing_allow_fetch");
if (quality.status !== "passed") blocks.push("quality_board_not_passed");
if (quality.batchIndex !== batchIndex) blocks.push("quality_batch_mismatch");

const targets = qualityRows.filter(row => row.routeQualityStatus === "needs_controlled_official_route_discovery");
if (targets.length !== qualityRows.length) blocks.push("not_all_rows_are_discovery_targets");

const rows = [];
let attemptedFetchCount = 0;

if (allowFetch && blocks.length === 0) {
  let targetIndex = 0;
  for (const target of targets) {
    targetIndex += 1;
    const spec = specs[target.slug];
    const rowBlocks = [];
    if (!spec) rowBlocks.push("missing_discovery_spec");

    const attempts = [];
    if (spec) {
      let urlIndex = 0;
      for (const url of spec.urls) {
        urlIndex += 1;
        attemptedFetchCount += 1;
        console.log(`[${targetIndex}/${targets.length}] ${target.slug} [${urlIndex}/${spec.urls.length}] ${url}`);
        const startedAt = new Date().toISOString();
        const fetched = await fetchWithTimeout(url, 18000);
        const endedAt = new Date().toISOString();

        const html = fetched.text || "";
        const title = titleOf(html);
        const finalUrl = fetched.response?.url || url;
        const textSample = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000);

        const attempt = {
          slug: target.slug,
          url,
          finalUrl,
          finalHost: hostOf(finalUrl),
          fetchStatus: fetched.response?.status ?? null,
          contentType: fetched.response?.headers?.get("content-type") || null,
          title,
          bodyLength: html.length,
          bodySha256: html ? shaText(html) : null,
          bodySample: textSample,
          hasCloudflareChallenge: /just a moment|cf-chl|cloudflare/i.test(html),
          hasAccessDenied: /access denied|forbidden|403|captcha|showcaptcha/i.test(html + " " + finalUrl),
          fetchError: fetched.error,
          timedOut: fetched.timedOut,
          startedAt,
          endedAt
        };

        const scored = scoreAttempt(spec, attempt);
        attempts.push({
          ...attempt,
          score: scored.score,
          passed: scored.passed,
          validationBlocks: scored.blocks,
          competitionTermHitCount: scored.competitionHits,
          routeTermHitCount: scored.routeHits,
          bodySample: undefined
        });
      }
    }

    const best = [...attempts].sort((a, b) => b.score - a.score || b.bodyLength - a.bodyLength)[0] || null;
    const passed = attempts.filter(a => a.passed).sort((a, b) => b.score - a.score)[0] || null;

    rows.push({
      slug: target.slug,
      displayName: target.displayName,
      batchIndex,
      controlledCandidateUrlCount: spec?.urls?.length || 0,
      attemptedFetchCount: attempts.length,
      discoveryStatus: passed ? "controlled_official_route_candidate_passed" : (best ? "controlled_official_route_candidate_needs_review" : "controlled_official_route_discovery_failed"),
      selectedUrl: passed?.url || null,
      selectedFinalUrl: passed?.finalUrl || null,
      selectedHost: passed?.finalHost || null,
      selectedTitle: passed?.title || null,
      selectedScore: passed?.score || null,
      bestReviewUrl: passed ? null : best?.url || null,
      bestReviewFinalUrl: passed ? null : best?.finalUrl || null,
      bestReviewHost: passed ? null : best?.finalHost || null,
      bestReviewTitle: passed ? null : best?.title || null,
      bestReviewScore: passed ? null : best?.score || null,
      reviewBlocks: passed ? [] : (best?.validationBlocks || rowBlocks),
      attemptSummaries: attempts.map(a => ({
        url: a.url,
        finalUrl: a.finalUrl,
        finalHost: a.finalHost,
        fetchStatus: a.fetchStatus,
        title: a.title,
        bodyLength: a.bodyLength,
        bodySha256: a.bodySha256,
        score: a.score,
        passed: a.passed,
        validationBlocks: a.validationBlocks,
        competitionTermHitCount: a.competitionTermHitCount,
        routeTermHitCount: a.routeTermHitCount,
        hasCloudflareChallenge: a.hasCloudflareChallenge,
        hasAccessDenied: a.hasAccessDenied
      })),
      acceptedNow: false,
      routeClaimMadeNow: false,
      familyClaimMadeNow: false,
      productionWriteExecutedNow: false,
      truthAssertionExecutedNow: false,
      rawPayloadCommitted: false,
      fullRawPayloadWritten: false
    });
  }
}

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "bulk_batch_controlled_official_route_discovery",
  contractVersion: 1,
  batchIndex,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  qualityPath: rel(qualityPath),
  qualityRowsPath: rel(qualityRowsPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: attemptedFetchCount,
    controlledOfficialRouteDiscoveryFetchExecutedNowCount: attemptedFetchCount,
    providerFetchExecutedNowCount: 0,
    routeClaimMadeNowCount: 0,
    familyClaimMadeNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    batchIndex,
    targetCount: targets.length,
    attemptedFetchCount,
    passedCount: rows.filter(row => row.discoveryStatus === "controlled_official_route_candidate_passed").length,
    needsReviewCount: rows.filter(row => row.discoveryStatus === "controlled_official_route_candidate_needs_review").length,
    failedCount: rows.filter(row => row.discoveryStatus === "controlled_official_route_discovery_failed").length,
    passedSlugs: rows.filter(row => row.discoveryStatus === "controlled_official_route_candidate_passed").map(row => row.slug),
    needsReviewSlugs: rows.filter(row => row.discoveryStatus === "controlled_official_route_candidate_needs_review").map(row => row.slug),
    failedSlugs: rows.filter(row => row.discoveryStatus === "controlled_official_route_discovery_failed").map(row => row.slug),
    acceptedNowCount: 0,
    routeClaimMadeNowCount: 0,
    familyClaimMadeNowCount: 0,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    nextRecommendedLane: "verify controlled official route discovery; passed rows require controlled fetch identity/surface verification before any extraction or candidate write"
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
    attemptedFetchCount: row.attemptedFetchCount,
    discoveryStatus: row.discoveryStatus,
    selectedFinalUrl: row.selectedFinalUrl,
    selectedHost: row.selectedHost,
    selectedTitle: row.selectedTitle,
    selectedScore: row.selectedScore,
    bestReviewFinalUrl: row.bestReviewFinalUrl,
    bestReviewHost: row.bestReviewHost,
    bestReviewTitle: row.bestReviewTitle,
    bestReviewScore: row.bestReviewScore,
    reviewBlocks: row.reviewBlocks
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
