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

function classifyStandingEvidence({ expectedHost, hostname, title, url }) {
  const expectedHostLower = asText(expectedHost).toLowerCase();
  const hostLower = asText(hostname).toLowerCase();
  const titleLower = asText(title).toLowerCase();
  const urlLower = asText(url).toLowerCase();

  if (!expectedHostLower || hostLower !== expectedHostLower) {
    return {
      classification: "wrong_host_reject",
      acceptAsStandingEvidence: false,
      confidence: 0.02,
      reason: "Result host does not match accepted official host."
    };
  }

  if (
    /(classement|classements|standing|standings|table)/u.test(titleLower) ||
    /(classement|classements|standing|standings|table)/u.test(urlLower)
  ) {
    return {
      classification: "host_scoped_standings_candidate",
      acceptAsStandingEvidence: true,
      confidence: 0.72,
      reason: "Accepted official host result with standings/classement/table marker in title or URL."
    };
  }

  if (
    /(championnat|championnats|competition|compétition|competitions|ligue|league)/u.test(titleLower) ||
    /(championnat|championnats|competition|competitions|ligue|league)/u.test(urlLower)
  ) {
    return {
      classification: "host_scoped_competition_navigation_candidate",
      acceptAsStandingEvidence: false,
      confidence: 0.45,
      reason: "Accepted official host competition navigation page; useful for navigation but not direct standings evidence."
    };
  }

  if (/(accueil|home|homepage)/u.test(titleLower) || /(accueil|home|homepage)/u.test(urlLower)) {
    return {
      classification: "official_host_homepage_only",
      acceptAsStandingEvidence: false,
      confidence: 0.2,
      reason: "Official host homepage only; no standings evidence."
    };
  }

  return {
    classification: "unknown_host_scoped_review",
    acceptAsStandingEvidence: false,
    confidence: 0.25,
    reason: "Accepted host result but insufficient standings/navigation evidence from search row metadata."
  };
}

function classifyHostScopedStandingsSearchResults(targetReport, smokeReport) {
  const targetMap = targetsById(targetReport);
  const searchResultRows = asArray(smokeReport.searchResultRows);

  const classifiedRows = searchResultRows.map((row) => {
    const target = targetMap.get(asText(row.searchTargetId)) || {};
    const verdict = classifyStandingEvidence({
      expectedHost: target.candidateHost,
      hostname: row.hostname,
      title: row.title,
      url: row.url
    });

    return {
      leagueSlug: asText(row.leagueSlug || target.leagueSlug),
      expectedLeagueSlug: asText(target.leagueSlug),
      country: asText(target.country),
      countryKey: asText(target.countryKey),
      region: asText(target.region),
      candidateHost: asText(target.candidateHost),
      searchTargetId: asText(row.searchTargetId),
      query: asText(row.query),
      hostname: asText(row.hostname),
      url: asText(row.url),
      title: asText(row.title),
      classification: verdict.classification,
      acceptAsStandingEvidence: verdict.acceptAsStandingEvidence,
      confidence: verdict.confidence,
      reason: verdict.reason,
      sourceFetch: false,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false
    };
  });

  const acceptedRows = classifiedRows.filter((row) => row.acceptAsStandingEvidence === true);

  const standingsCandidateBoard = Object.values(
    acceptedRows.reduce((acc, row) => {
      const key = `${row.expectedLeagueSlug || row.leagueSlug}::${row.candidateHost}::${row.url}`;
      if (!acc[key]) {
        acc[key] = {
          leagueSlug: row.expectedLeagueSlug || row.leagueSlug,
          country: row.country,
          countryKey: row.countryKey,
          region: row.region,
          candidateHost: row.candidateHost,
          standingsUrl: row.url,
          candidateRowCount: 0,
          maxConfidence: 0,
          classifications: [],
          titles: [],
          queries: []
        };
      }

      acc[key].candidateRowCount += 1;
      acc[key].maxConfidence = Math.max(acc[key].maxConfidence, row.confidence);
      acc[key].classifications.push(row.classification);
      acc[key].titles.push(row.title);
      acc[key].queries.push(row.query);

      return acc;
    }, {})
  ).map((row) => ({
    ...row,
    classifications: unique(row.classifications),
    titles: unique(row.titles).slice(0, 8),
    queries: unique(row.queries).slice(0, 8)
  })).sort((a, b) => {
    return b.maxConfidence - a.maxConfidence ||
      b.candidateRowCount - a.candidateRowCount ||
      a.leagueSlug.localeCompare(b.leagueSlug) ||
      a.standingsUrl.localeCompare(b.standingsUrl);
  });

  return {
    ok: true,
    job: "classify-football-truth-provider-discovery-host-scoped-standings-search-results-file",
    mode: "read_only_host_scoped_standings_search_result_classification",
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
      acceptedStandingEvidenceRowCount: acceptedRows.length,
      standingsCandidateCount: standingsCandidateBoard.length,
      byClassification: countBy(classifiedRows, (row) => row.classification),
      byAcceptedHost: countBy(acceptedRows, (row) => row.candidateHost),
      byAcceptedLeagueSlug: countBy(acceptedRows, (row) => row.expectedLeagueSlug || row.leagueSlug),
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    standingsCandidateBoard,
    classifiedRows,
    rejectedRows: classifiedRows.filter((row) => row.acceptAsStandingEvidence !== true),
    policy: {
      purpose: "Classify host-scoped official standings search rows before any URL fetch or canonical promotion.",
      accepts: [
        "accepted official host result with standings/classement/table marker"
      ],
      rejects: [
        "wrong host",
        "official host homepage only",
        "competition navigation without direct standings/table marker",
        "unknown host-scoped result"
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
        searchTargetId: "provider-discovery-host-scoped-standings:benin:febefoot.org:ben.1:001",
        leagueSlug: "ben.1",
        country: "Benin",
        countryKey: "benin",
        region: "africa",
        candidateHost: "febefoot.org"
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
        searchTargetId: "provider-discovery-host-scoped-standings:benin:febefoot.org:ben.1:001",
        leagueSlug: "ben.1",
        query: "site:febefoot.org classement",
        hostname: "febefoot.org",
        title: "Classements - Site Officiel de la Fédération Béninoise de Football (FBF)",
        url: "https://febefoot.org/Classements/classements/"
      },
      {
        searchTargetId: "provider-discovery-host-scoped-standings:benin:febefoot.org:ben.1:001",
        leagueSlug: "ben.1",
        query: "site:febefoot.org standings",
        hostname: "febefoot.org",
        title: "Accueil - Site Officiel de la Fédération Béninoise de Football (FBF)",
        url: "https://febefoot.org/accueil/"
      },
      {
        searchTargetId: "provider-discovery-host-scoped-standings:benin:febefoot.org:ben.1:001",
        leagueSlug: "ben.1",
        query: "site:febefoot.org standings",
        hostname: "example.com",
        title: "Fake standings",
        url: "https://example.com/"
      }
    ]
  };

  const report = classifyHostScopedStandingsSearchResults(targetReport, smokeReport);

  if (report.summary.classifiedRowCount !== 3) {
    throw new Error("Self-test expected 3 classified rows");
  }

  if (report.summary.acceptedStandingEvidenceRowCount !== 1) {
    throw new Error("Self-test expected 1 accepted standing evidence row");
  }

  if (report.summary.standingsCandidateCount !== 1) {
    throw new Error("Self-test expected 1 standings candidate");
  }

  if (report.standingsCandidateBoard[0].standingsUrl !== "https://febefoot.org/Classements/classements/") {
    throw new Error(`Self-test expected Classements URL, got ${report.standingsCandidateBoard[0]?.standingsUrl}`);
  }

  if (report.summary.byClassification.host_scoped_standings_candidate !== 1) {
    throw new Error("Self-test expected 1 host_scoped_standings_candidate");
  }

  if (report.summary.byClassification.official_host_homepage_only !== 1) {
    throw new Error("Self-test expected 1 official_host_homepage_only");
  }

  if (report.summary.byClassification.wrong_host_reject !== 1) {
    throw new Error("Self-test expected 1 wrong_host_reject");
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
      standingsCandidateBoard: report.standingsCandidateBoard,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.targets) throw new Error("Missing required --targets");
  if (!args.input) throw new Error("Missing required --input");
  if (!args.output) throw new Error("Missing required --output");

  const targetReport = readJson(args.targets);
  const smokeReport = readJson(args.input);
  const report = classifyHostScopedStandingsSearchResults(targetReport, smokeReport);

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    standingsCandidateBoard: report.standingsCandidateBoard,
    guarantees: report.guarantees
  }, null, 2));
}

main();
