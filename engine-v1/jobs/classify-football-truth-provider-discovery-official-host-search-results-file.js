#!/usr/bin/env node

import fs from "fs";
import path from "path";

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    selfTest: false,
    targets: "",
    input: "",
    output: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--targets") args.targets = argv[++index];
    else if (arg === "--input") args.input = argv[++index];
    else if (arg === "--output") args.output = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return String(value ?? "").trim();
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = asText(keyFn(row)) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function unique(values) {
  return Array.from(new Set(values.map(asText).filter(Boolean)));
}

function targetsById(targetReport) {
  const map = new Map();
  for (const target of asArray(targetReport.searchTargetRows)) {
    map.set(asText(target.searchTargetId), target);
  }
  return map;
}

function classifyHost({ hostname, title, url }) {
  const hostLower = asText(hostname).toLowerCase();
  const titleLower = asText(title).toLowerCase();
  const urlLower = asText(url).toLowerCase();

  if (/(sofascore|footystats|fcstats|betimate|tribuna|livescore|flashscore|soccerway|transfermarkt)/u.test(hostLower)) {
    return {
      classification: "aggregator_or_stats",
      acceptAsOfficialHost: false,
      confidence: 0.05,
      reason: "Known aggregator/statistics domain."
    };
  }

  if (/wikipedia/u.test(hostLower)) {
    return {
      classification: "reference_only",
      acceptAsOfficialHost: false,
      confidence: 0.05,
      reason: "Reference site only."
    };
  }

  if (/(facebook|instagram|twitter|x\.com|youtube|linkedin)/u.test(hostLower)) {
    return {
      classification: "social_only",
      acceptAsOfficialHost: false,
      confidence: 0.1,
      reason: "Social media page only; useful as weak identity hint, not provider host."
    };
  }

  if (hostLower === "inside.fifa.com" || /(^|\.)fifa\.com$/u.test(hostLower) || /fifa\.com/u.test(urlLower)) {
    return {
      classification: "fifa_profile_only",
      acceptAsOfficialHost: false,
      confidence: 0.1,
      reason: "FIFA association profile, not domestic competition provider."
    };
  }

  if (/(cafonline|the-afc|uefa|concacaf|conmebol|oceaniafootball)/u.test(hostLower)) {
    return {
      classification: "confederation_profile_or_news",
      acceptAsOfficialHost: false,
      confidence: 0.15,
      reason: "Confederation domain, not domestic official host."
    };
  }

  if (
    /(fédération|federation|football association|association de football|site officiel|official)/u.test(titleLower) &&
    !/(fifa|cafonline|facebook|wikipedia)/u.test(hostLower)
  ) {
    return {
      classification: "official_host_candidate",
      acceptAsOfficialHost: true,
      confidence: 0.78,
      reason: "Title indicates official federation/association and host is not a known rejected umbrella/social/reference domain."
    };
  }

  if (
    /(fed|feder|football|foot|fa|fbf|faf|fecafoot|febefoot|frmf|efa|ghanafa|nff|zff)/u.test(hostLower) &&
    !/(fifa|cafonline|facebook|wikipedia)/u.test(hostLower)
  ) {
    return {
      classification: "possible_official_host_candidate",
      acceptAsOfficialHost: true,
      confidence: 0.55,
      reason: "Host pattern resembles football federation/association domain but title evidence is weaker."
    };
  }

  return {
    classification: "unknown_review",
    acceptAsOfficialHost: false,
    confidence: 0.25,
    reason: "Insufficient official-host evidence from search row metadata."
  };
}

function classifyOfficialHostSearchResults(targetReport, smokeReport) {
  const targetMap = targetsById(targetReport);
  const searchResultRows = asArray(smokeReport.searchResultRows);

  const classifiedRows = searchResultRows.map((row) => {
    const target = targetMap.get(asText(row.searchTargetId)) || {};
    const verdict = classifyHost({
      hostname: row.hostname,
      title: row.title,
      url: row.url
    });

    return {
      country: asText(target.country),
      countryKey: asText(target.countryKey),
      region: asText(target.region),
      representativeSlug: asText(target.leagueSlug || row.leagueSlug),
      searchTargetId: asText(row.searchTargetId),
      query: asText(row.query),
      hostname: asText(row.hostname),
      url: asText(row.url),
      title: asText(row.title),
      classification: verdict.classification,
      acceptAsOfficialHost: verdict.acceptAsOfficialHost,
      confidence: verdict.confidence,
      reason: verdict.reason,
      retryCompetitionCount: Number(target.retryCompetitionCount || 0),
      retryCompetitionExamples: asArray(target.retryCompetitionExamples)
    };
  });

  const acceptedRows = classifiedRows.filter((row) => row.acceptAsOfficialHost === true);

  const candidateHostBoard = Object.values(
    acceptedRows.reduce((acc, row) => {
      const key = `${row.countryKey || row.country}::${row.hostname}`;
      if (!acc[key]) {
        acc[key] = {
          country: row.country,
          countryKey: row.countryKey,
          region: row.region,
          candidateHost: row.hostname,
          representativeSlugs: [],
          candidateRowCount: 0,
          maxConfidence: 0,
          classifications: [],
          titles: [],
          urls: [],
          retryCompetitionExamples: []
        };
      }

      acc[key].candidateRowCount += 1;
      acc[key].maxConfidence = Math.max(acc[key].maxConfidence, row.confidence);
      acc[key].representativeSlugs.push(row.representativeSlug);
      acc[key].classifications.push(row.classification);
      acc[key].titles.push(row.title);
      acc[key].urls.push(row.url);
      acc[key].retryCompetitionExamples.push(...row.retryCompetitionExamples);

      return acc;
    }, {})
  ).map((row) => ({
    ...row,
    representativeSlugs: unique(row.representativeSlugs),
    classifications: unique(row.classifications),
    titles: unique(row.titles).slice(0, 8),
    urls: unique(row.urls).slice(0, 8),
    retryCompetitionExamples: unique(row.retryCompetitionExamples.map((item) => item.leagueSlug)).slice(0, 12)
  })).sort((a, b) => {
    return b.maxConfidence - a.maxConfidence ||
      b.candidateRowCount - a.candidateRowCount ||
      a.country.localeCompare(b.country) ||
      a.candidateHost.localeCompare(b.candidateHost);
  });

  return {
    ok: true,
    job: "classify-football-truth-provider-discovery-official-host-search-results-file",
    mode: "read_only_official_host_search_result_classification",
    generatedAt: new Date().toISOString(),
    inputSummary: {
      targetSummary: targetReport.summary || {},
      smokeSummary: smokeReport.summary || {}
    },
    summary: {
      searchTargetCount: Number(smokeReport.summary?.searchTargetCount || 0),
      selectedSearchTargetCount: Number(smokeReport.summary?.selectedSearchTargetCount || 0),
      searchResultRowCount: searchResultRows.length,
      classifiedRowCount: classifiedRows.length,
      acceptedOfficialHostRowCount: acceptedRows.length,
      candidateHostCount: candidateHostBoard.length,
      byClassification: countBy(classifiedRows, (row) => row.classification),
      byAcceptedHost: countBy(acceptedRows, (row) => row.hostname),
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    candidateHostBoard,
    classifiedRows,
    rejectedRows: classifiedRows.filter((row) => row.acceptAsOfficialHost !== true),
    policy: {
      purpose: "Classify official-host discovery search rows before host-scoped standings retry targets.",
      accepts: [
        "official federation/association host evidence",
        "possible official football association host pattern"
      ],
      rejects: [
        "aggregators/statistics",
        "FIFA profile only",
        "confederation profile/news only",
        "social-only pages",
        "reference-only pages"
      ],
      noSearch: true,
      noFetch: true,
      noCanonicalWrite: true,
      noProductionWrite: true
    },
    guarantees: {
      noSearch: true,
      noFetch: true,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      noCanonicalPromotion: true
    }
  };
}

function runSelfTest() {
  const targetReport = {
    summary: {
      searchTargetCount: 2
    },
    searchTargetRows: [
      {
        searchTargetId: "provider-discovery-official-host:benin:001",
        country: "Benin",
        countryKey: "benin",
        region: "africa",
        leagueSlug: "ben.1",
        retryCompetitionCount: 2,
        retryCompetitionExamples: [
          { leagueSlug: "ben.1" },
          { leagueSlug: "ben.2" }
        ]
      },
      {
        searchTargetId: "provider-discovery-official-host:angola:001",
        country: "Angola",
        countryKey: "angola",
        region: "africa",
        leagueSlug: "ang.1",
        retryCompetitionCount: 2,
        retryCompetitionExamples: [
          { leagueSlug: "ang.1" },
          { leagueSlug: "ang.2" }
        ]
      }
    ]
  };

  const smokeReport = {
    summary: {
      searchTargetCount: 2,
      selectedSearchTargetCount: 2
    },
    searchResultRows: [
      {
        searchTargetId: "provider-discovery-official-host:benin:001",
        leagueSlug: "ben.1",
        query: "Benin football federation official website",
        hostname: "febefoot.org",
        title: "Homepage - Site Officiel de la Fédération Béninoise de Football",
        url: "https://febefoot.org/"
      },
      {
        searchTargetId: "provider-discovery-official-host:angola:001",
        leagueSlug: "ang.1",
        query: "Angola football federation official website",
        hostname: "inside.fifa.com",
        title: "Angolan Football Association - inside.fifa.com",
        url: "https://inside.fifa.com/about-fifa/associations/ANG"
      },
      {
        searchTargetId: "provider-discovery-official-host:angola:001",
        leagueSlug: "ang.1",
        query: "Angola football federation league standings",
        hostname: "fcstats.com",
        title: "Table - Angola - Girabola - Football stats & tables",
        url: "https://fcstats.com/"
      }
    ]
  };

  const report = classifyOfficialHostSearchResults(targetReport, smokeReport);

  if (report.summary.classifiedRowCount !== 3) {
    throw new Error("Self-test expected 3 classified rows");
  }

  if (report.summary.acceptedOfficialHostRowCount !== 1) {
    throw new Error("Self-test expected 1 accepted official host row");
  }

  if (report.summary.candidateHostCount !== 1) {
    throw new Error("Self-test expected 1 candidate host");
  }

  if (report.candidateHostBoard[0].candidateHost !== "febefoot.org") {
    throw new Error(`Self-test expected febefoot.org candidate, got ${report.candidateHostBoard[0]?.candidateHost}`);
  }

  if (report.summary.byClassification.official_host_candidate !== 1) {
    throw new Error("Self-test expected 1 official_host_candidate");
  }

  if (report.summary.byClassification.fifa_profile_only !== 1) {
    throw new Error("Self-test expected 1 fifa_profile_only");
  }

  if (report.summary.byClassification.aggregator_or_stats !== 1) {
    throw new Error("Self-test expected 1 aggregator_or_stats");
  }

  if (report.guarantees.noSearch !== true || report.guarantees.noFetch !== true || report.guarantees.canonicalWrites !== 0) {
    throw new Error("Self-test read-only guarantees failed");
  }

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = runSelfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: true,
      summary: report.summary,
      candidateHostBoard: report.candidateHostBoard,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.targets) throw new Error("Missing required --targets");
  if (!args.input) throw new Error("Missing required --input");
  if (!args.output) throw new Error("Missing required --output");

  const targetReport = readJson(args.targets);
  const smokeReport = readJson(args.input);
  const report = classifyOfficialHostSearchResults(targetReport, smokeReport);

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    candidateHostBoard: report.candidateHostBoard,
    guarantees: report.guarantees
  }, null, 2));
}

main();
