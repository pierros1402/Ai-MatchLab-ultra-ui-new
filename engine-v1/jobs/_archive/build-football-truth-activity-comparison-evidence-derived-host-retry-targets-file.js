import fs from "fs";
import path from "path";

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    watchlist: "",
    fullMap: "",
    currentBoard: "",
    searchResults: "",
    output: "",
    date: "",
    selfTest: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--watchlist") {
      args.watchlist = argv[++index] || "";
      continue;
    }

    if (arg === "--full-map") {
      args.fullMap = argv[++index] || "";
      continue;
    }

    if (arg === "--current-board") {
      args.currentBoard = argv[++index] || "";
      continue;
    }

    if (arg === "--search-results") {
      args.searchResults = argv[++index] || "";
      continue;
    }

    if (arg === "--output") {
      args.output = argv[++index] || "";
      continue;
    }

    if (arg === "--date") {
      args.date = argv[++index] || "";
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function selectRows(obj, names) {
  for (const name of names) {
    if (Array.isArray(obj?.[name])) return obj[name];
  }
  return [];
}

function collectStrings(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, out);
    return out;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    out.push(String(value));
  }

  return out;
}

function walk(value, visit, pathParts = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, [...pathParts, String(index)]));
    return;
  }

  if (value && typeof value === "object") {
    visit(value, pathParts);
    for (const [key, item] of Object.entries(value)) {
      walk(item, visit, [...pathParts, key]);
    }
  }
}

function normalizeHost(host) {
  return asText(host)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[),.;:'"<>]+$/g, "")
    .replace(/\/.*$/g, "");
}

function extractHostsFromText(text) {
  const value = asText(text);
  const hosts = new Set();

  const urlRegex = /https?:\/\/([^/\s"'<>]+)/gi;
  let match;
  while ((match = urlRegex.exec(value)) !== null) {
    hosts.add(normalizeHost(match[1]));
  }

  const hostRegex = /\b((?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+\.[a-z]{2,})\b/gi;
  while ((match = hostRegex.exec(value)) !== null) {
    hosts.add(normalizeHost(match[1]));
  }

  return Array.from(hosts).filter(Boolean);
}

function exactSlugMatch(obj, slug) {
  if (!obj || typeof obj !== "object") return false;

  const directFields = [
    obj.competitionSlug,
    obj.leagueSlug,
    obj.slug,
    obj.competition,
    obj.league
  ];

  return directFields.some((value) => asText(value) === slug);
}

function extractHostEvidenceFromExactJsonObjects({ sourceName, json, slug }) {
  const evidence = [];

  walk(json, (obj, pathParts) => {
    if (!exactSlugMatch(obj, slug)) return;

    const contextText = collectStrings(obj, []).join(" ");
    const hosts = extractHostsFromText(contextText);

    for (const host of hosts) {
      evidence.push({
        competitionSlug: slug,
        host,
        sourceName,
        path: pathParts.join("."),
        contextText: contextText.slice(0, 1200)
      });
    }
  });

  return evidence;
}

function extractHostEvidenceFromSearchResults({ searchResults, slug }) {
  const rows = selectRows(searchResults, ["searchResultRows", "rows", "items", "targets"]);
  const evidence = [];

  for (const row of rows) {
    const rowSlug = asText(row.competitionSlug || row.leagueSlug);
    if (rowSlug !== slug) continue;

    const contextText = collectStrings(row, []).join(" ");
    const hosts = extractHostsFromText(asText(row.url));

    for (const host of hosts) {
      evidence.push({
        competitionSlug: slug,
        host,
        sourceName: "controlled_search_results",
        path: "searchResultRows",
        contextText: contextText.slice(0, 1200)
      });
    }
  }

  return evidence;
}

function isInvalidHost(host) {
  const h = normalizeHost(host);
  if (!h) return true;
  if (h.endsWith(".json")) return true;
  if (!h.includes(".")) return true;
  if (h.includes("..")) return true;
  if (/^[a-z]{2,3}\.\d+$/.test(h)) return true;
  if (/^[a-z]{2,3}\.\d+\.json$/.test(h)) return true;
  if (/^[a-z]{2,3}\.[a-z0-9_.-]+$/.test(h) && !h.includes(".com") && !h.includes(".org") && !h.includes(".ie") && !h.includes(".is") && !h.includes(".fi") && !h.includes(".pe")) {
    return true;
  }
  return false;
}

function isNoisyHost(host, contextText = "") {
  const h = normalizeHost(host);
  const context = asText(contextText).toLowerCase();

  if (isInvalidHost(h)) return true;

  const noisyHostPatterns = [
    /wikipedia\.org$/,
    /britannica\.com$/,
    /youtube\.com$/,
    /facebook\.com$/,
    /reddit\.com$/,
    /pinterest\./,
    /linkedin\.com$/,
    /twitter\.com$/,
    /x\.com$/,
    /tripadvisor\./,
    /apple\.com$/,
    /play\.google\.com$/,
    /google\.com$/,
    /netflix\.com$/,
    /ea\.com$/,
    /riotgames\.com$/,
    /leagueoflegends\.com$/,
    /op\.gg$/,
    /u\.gg$/,
    /worldatlas\.com$/,
    /peru\.travel$/,
    /peruwow\.travel$/,
    /peru\.info$/,
    /icelandair\.com$/,
    /iceland\.org$/,
    /guidetoiceland\.is$/,
    /study\.iceland\.is$/,
    /omniglot\.com$/,
    /mfa\.gov\.sg$/,
    /baidu\.com$/,
    /wikihow\.com$/,
    /icloud\.com$/,
    /microsoft\.com$/,
    /live\.com$/,
    /epicgames\.com$/,
    /pearsonactivelearn\.com$/,
    /bt\.com$/,
    /metro\.co\.uk$/,
    /sky\.com$/,
    /bbc\.co\.uk$/
  ];

  if (noisyHostPatterns.some((pattern) => pattern.test(h))) return true;
  if (context.includes("travel") && !context.includes("football") && !context.includes("fixtures")) return true;

  return false;
}

function classifyHostEvidence(evidenceRows) {
  const byHost = new Map();

  for (const row of evidenceRows) {
    const host = normalizeHost(row.host);
    if (!host || isNoisyHost(host, row.contextText)) continue;

    if (!byHost.has(host)) {
      byHost.set(host, {
        host,
        evidenceCount: 0,
        sourceNames: new Set(),
        paths: new Set(),
        contexts: []
      });
    }

    const item = byHost.get(host);
    item.evidenceCount += 1;
    item.sourceNames.add(row.sourceName);
    item.paths.add(row.path);
    if (item.contexts.length < 5) item.contexts.push(row.contextText);
  }

  const classified = [];

  for (const item of byHost.values()) {
    const sourceNames = Array.from(item.sourceNames).sort();
    const paths = Array.from(item.paths).sort();
    const host = item.host;
    const context = item.contexts.join(" ").toLowerCase();

    const sourceWeight =
      (sourceNames.includes("current_board") ? 4 : 0) +
      (sourceNames.includes("full_map") ? 3 : 0) +
      (sourceNames.includes("controlled_search_results") ? 1 : 0);

    const secondaryCue =
      /flashscore|soccerway|sofascore|fotmob|transfermarkt|livescore|extratime/.test(host);

    const officialCue =
      /\bofficial\b/.test(context) ||
      /\bfederation\b/.test(context) ||
      /\bleague\b/.test(context) ||
      /\btournament_route\b/.test(context) ||
      /\bseason_route\b/.test(context) ||
      /\bcompetition_widget\b/.test(context) ||
      /\bajax\b/.test(context) ||
      /\bsourcehost\b/.test(context) ||
      sourceNames.includes("current_board") ||
      sourceNames.includes("full_map");

    let hostTruthStatus = "candidate_host_requires_review";
    if (secondaryCue) {
      hostTruthStatus = "secondary_reference_only";
    } else if (officialCue && sourceWeight >= 3) {
      hostTruthStatus = "evidence_derived_candidate_official_host";
    }

    classified.push({
      host,
      hostTruthStatus,
      evidenceCount: item.evidenceCount,
      sourceNames,
      paths,
      officialCue,
      secondaryCue,
      score: sourceWeight + (officialCue ? 3 : 0) + (secondaryCue ? 1 : 0) + Math.min(item.evidenceCount, 5),
      sampleContext: item.contexts[0] || ""
    });
  }

  return classified
    .filter((row) =>
      row.hostTruthStatus === "evidence_derived_candidate_official_host" ||
      row.hostTruthStatus === "secondary_reference_only"
    )
    .sort((a, b) => {
      if (a.hostTruthStatus !== b.hostTruthStatus) {
        if (a.hostTruthStatus === "evidence_derived_candidate_official_host") return -1;
        if (b.hostTruthStatus === "evidence_derived_candidate_official_host") return 1;
      }
      if (b.score !== a.score) return b.score - a.score;
      if (b.evidenceCount !== a.evidenceCount) return b.evidenceCount - a.evidenceCount;
      return a.host.localeCompare(b.host);
    });
}

function capHostsForSlug(classifiedHosts) {
  const official = classifiedHosts
    .filter((row) => row.hostTruthStatus === "evidence_derived_candidate_official_host")
    .slice(0, 4);

  const secondary = classifiedHosts
    .filter((row) => row.hostTruthStatus === "secondary_reference_only")
    .slice(0, 3);

  return [...official, ...secondary];
}

function buildQuery(target, hostRow) {
  const name = asText(target.displayName || target.name || target.competitionSlug);
  const country = asText(target.countryName);
  const layer = asText(target.comparisonLayer);

  if (hostRow.hostTruthStatus === "secondary_reference_only") {
    return `site:${hostRow.host} "${name}" ${country} fixtures results standings schedule`;
  }

  if (layer === "primary_official_truth") {
    return `site:${hostRow.host} "${name}" fixtures results standings schedule season`;
  }

  return `site:${hostRow.host} "${name}" ${country} fixtures results standings schedule`;
}

function buildReport({ watchlist, fullMap, currentBoard, searchResults, date }) {
  const baseTargets = selectRows(watchlist, ["searchTargetRows", "selectedTargetRows", "targets", "rows", "items"]);
  const slugs = Array.from(new Set(baseTargets.map((row) => asText(row.competitionSlug || row.leagueSlug)).filter(Boolean))).sort();

  const hostBoards = [];
  const retryRows = [];
  const needsOfficialHostDiscoveryRows = [];

  for (const slug of slugs) {
    const evidenceRows = [
      ...extractHostEvidenceFromExactJsonObjects({ sourceName: "full_map", json: fullMap, slug }),
      ...extractHostEvidenceFromExactJsonObjects({ sourceName: "current_board", json: currentBoard, slug }),
      ...extractHostEvidenceFromSearchResults({ searchResults, slug })
    ];

    const classifiedHosts = classifyHostEvidence(evidenceRows);
    const selectedHosts = capHostsForSlug(classifiedHosts);

    hostBoards.push({
      competitionSlug: slug,
      rawEvidenceHostMentionCount: evidenceRows.length,
      classifiedHostCount: classifiedHosts.length,
      selectedHostCount: selectedHosts.length,
      selectedHosts,
      rejectedOrUnselectedHostCount: Math.max(0, classifiedHosts.length - selectedHosts.length)
    });

    if (selectedHosts.length < 1) {
      const target = baseTargets.find((row) => asText(row.competitionSlug || row.leagueSlug) === slug) || {};
      needsOfficialHostDiscoveryRows.push({
        competitionSlug: slug,
        displayName: asText(target.displayName || target.name || slug),
        countryName: asText(target.countryName),
        reason: "no_strict_evidence_derived_candidate_host_selected",
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true
      });
      continue;
    }

    const targetRowsForSlug = baseTargets.filter((row) => asText(row.competitionSlug || row.leagueSlug) === slug);

    for (const target of targetRowsForSlug) {
      for (const hostRow of selectedHosts) {
        retryRows.push({
          ...target,
          searchTargetId: [
            asText(target.dayKey) || date || "unknown-day",
            slug,
            asText(target.comparisonLayer || "comparison"),
            hostRow.host
          ].join(":"),
          competitionSlug: slug,
          leagueSlug: slug,
          query: buildQuery(target, hostRow),
          originalQuery: asText(target.query),
          hostBias: hostRow.host,
          hostBiasTruthStatus: hostRow.hostTruthStatus,
          hostBiasEvidenceCount: hostRow.evidenceCount,
          hostBiasSourceNames: hostRow.sourceNames,
          hostBiasedRetry: true,
          retryReason: "general_active_watchlist_search_low_quality_retry_with_strict_evidence_derived_host_bias",
          mayPromoteCanonical: false,
          canonicalWrites: 0,
          productionWrite: false,
          dryRun: true
        });
      }
    }
  }

  const byCompetition = {};
  const byHostTruthStatus = {};
  const invalidSelectedHosts = [];

  for (const row of retryRows) {
    byCompetition[row.competitionSlug] = (byCompetition[row.competitionSlug] || 0) + 1;
    byHostTruthStatus[row.hostBiasTruthStatus] = (byHostTruthStatus[row.hostBiasTruthStatus] || 0) + 1;
    if (isInvalidHost(row.hostBias) || isNoisyHost(row.hostBias, row.query)) {
      invalidSelectedHosts.push({
        competitionSlug: row.competitionSlug,
        host: row.hostBias,
        query: row.query
      });
    }
  }

  return {
    ok: true,
    job: "build-football-truth-activity-comparison-evidence-derived-host-retry-targets-file",
    mode: "read_only_strict_evidence_derived_host_biased_active_watchlist_retry_targets",
    generatedAt: new Date().toISOString(),
    date,
    summary: {
      sourceTargetRowCount: baseTargets.length,
      competitionCount: slugs.length,
      hostBoardCompetitionCount: hostBoards.length,
      hostBiasedRetryTargetCount: retryRows.length,
      needsOfficialHostDiscoveryCount: needsOfficialHostDiscoveryRows.length,
      invalidSelectedHostCount: invalidSelectedHosts.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byCompetition,
    byHostTruthStatus,
    hostBoards,
    needsOfficialHostDiscoveryRows,
    invalidSelectedHosts,
    policy: {
      evidenceDerivedHostBiasDoesNotEqualTruth: true,
      exactCompetitionObjectRequiredForJsonEvidence: true,
      candidateOfficialHostsRequireVerification: true,
      secondaryReferenceMayNotPromoteCanonical: true,
      noManualHostWhitelist: true,
      noFetch: true,
      noCanonicalPromotion: true,
      zeroResultDoesNotImplyAbsence: true
    },
    searchTargetRows: retryRows,
    guarantees: {
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function selfTest() {
  const report = buildReport({
    date: "2026-06-12",
    watchlist: {
      searchTargetRows: [
        {
          competitionSlug: "abc.1",
          leagueSlug: "abc.1",
          displayName: "ABC League",
          countryName: "ABC",
          comparisonLayer: "primary_official_truth",
          dayKey: "2026-06-12",
          query: "\"ABC League\" official fixtures"
        }
      ]
    },
    fullMap: {
      rows: [
        {
          competitionSlug: "abc.1",
          sourceHost: "abc-league.example.com",
          note: "ABC League official site season_route"
        },
        {
          competitionSlug: "other.1",
          sourceHost: "wrong.example.com",
          note: "Should not be selected for abc.1"
        }
      ]
    },
    currentBoard: {
      rows: [
        {
          competitionSlug: "abc.1",
          sourceHost: "abc-board.example.com",
          note: "ABC League official current board"
        },
        {
          competitionSlug: "abc.2",
          sourceHost: "abc-two.example.com",
          note: "Should not be selected for abc.1"
        }
      ]
    },
    searchResults: {
      searchResultRows: [
        {
          leagueSlug: "abc.1",
          url: "https://www.flashscore.com/football/abc/abc-league/",
          title: "ABC League fixtures"
        }
      ]
    }
  });

  if (report.summary.hostBiasedRetryTargetCount !== 3) throw new Error("expected three strict host-biased targets");
  const hosts = report.searchTargetRows.map((row) => row.hostBias).sort();
  if (!hosts.includes("abc-league.example.com")) throw new Error("expected full-map exact host");
  if (!hosts.includes("abc-board.example.com")) throw new Error("expected current-board exact host");
  if (!hosts.includes("www.flashscore.com")) throw new Error("expected exact search-result secondary host");
  if (hosts.includes("wrong.example.com") || hosts.includes("abc-two.example.com")) throw new Error("must not select non-exact slug hosts");
  if (report.summary.invalidSelectedHostCount !== 0) throw new Error("expected no invalid hosts");
  if (report.guarantees.noSearch !== true || report.guarantees.noFetch !== true) throw new Error("expected read-only guarantees");
  if (report.policy.noManualHostWhitelist !== true) throw new Error("expected no manual host whitelist policy");

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-activity-comparison-evidence-derived-host-retry-targets-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.watchlist) throw new Error("--watchlist is required");
  if (!args.fullMap) throw new Error("--full-map is required");
  if (!args.currentBoard) throw new Error("--current-board is required");
  if (!args.searchResults) throw new Error("--search-results is required");
  if (!args.output) throw new Error("--output is required");

  const report = buildReport({
    watchlist: readJson(args.watchlist),
    fullMap: readJson(args.fullMap),
    currentBoard: readJson(args.currentBoard),
    searchResults: readJson(args.searchResults),
    date: args.date
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    job: "build-football-truth-activity-comparison-evidence-derived-host-retry-targets-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}