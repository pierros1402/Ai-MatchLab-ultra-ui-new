#!/usr/bin/env node

import fs from "fs";
import path from "path";
import os from "os";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--self-test") {
      args.selfTest = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    }
  }
  return args;
}

function readJsonIfPresent(filePath) {
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hostOf(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, "").split("/")[0].replace(/^www\./i, "").toLowerCase();
  }
}

function clean(value) {
  return String(value || "").trim();
}

function addToSet(map, key, value) {
  if (!value) return;
  if (!map[key]) map[key] = new Set();
  map[key].add(value);
}

function hasBettingSignal(text) {
  return /\b(bet|betting|bookmaker|odds|casino|wager|tipster|tips|prediction|predictions|free picks?)\b/i.test(text);
}

function hasFixtureListingSignal(text) {
  return /\b(fixtures?|matches|schedule|results?|match centre|match center|scores?|calendar)\b/i.test(text);
}

function hasOfficialSignal(host, text) {
  const officialHostPattern = /\b(uefa\.com|fifa\.com|conmebol\.com|the-afc\.com|cafonline\.com|concacaf\.com|premierleague\.com|efl\.com|laliga\.com|bundesliga\.com|legaseriea\.it|ligue1\.com|eredivisie\.nl|proleague\.be|mlssoccer\.com)\b/i;
  if (officialHostPattern.test(host)) return true;

  return /\b(official_fixture_source|official_league|competition_operator|national_federation|official_club|primary_candidate_after_fetch_evidence|candidate_official_url_pending_fetch)\b/i.test(text);
}

function recommendedTierForHost(row) {
  if (row.bettingSignalCount > 0) return "rejected_betting_or_prediction";
  if (row.officialSignalCount > 0 && row.targetDateEvidenceCount > 0) return "official_candidate_needs_validation";
  if (row.officialSignalCount > 0) return "official_candidate_needs_fetch_evidence";
  if (row.fixtureListingSignalCount > 0 && row.sourceClasses.includes("trusted_independent_fixture_listing")) {
    return "trusted_supplemental_candidate";
  }
  if (
    row.fixtureListingSignalCount > 0 &&
    (row.sourceClasses.includes("supplemental_scoreboard_or_media") || row.truthRoles.includes("supplemental_crosscheck_only"))
  ) {
    return "supplemental_crosscheck_candidate";
  }
  if (row.fixtureListingSignalCount > 0) return "fixture_listing_candidate_needs_classification";
  return "unknown_needs_review";
}

function summarizeHostRows(inputs, options = {}) {
  const byHost = new Map();

  function getHostRow(host) {
    const cleanHost = hostOf(host);
    if (!cleanHost) return null;
    if (!byHost.has(cleanHost)) {
      byHost.set(cleanHost, {
        host: cleanHost,
        timesSeen: 0,
        leagueSlugsSet: new Set(),
        dayKeysSet: new Set(),
        sourceClassesSet: new Set(),
        truthRolesSet: new Set(),
        candidateUrlsSet: new Set(),
        titles: [],
        officialSignalCount: 0,
        fixtureListingSignalCount: 0,
        bettingSignalCount: 0,
        targetDateEvidenceCount: 0,
        fetchedOkCount: 0,
        evidenceRowCount: 0,
        samples: []
      });
    }
    return byHost.get(cleanHost);
  }

  function observeCandidate(row, sourceKind) {
    const url = clean(row.candidateUrl || row.resolvedUrl || row.finalUrl || row.url);
    const host = hostOf(row.hostname || url);
    const hostRow = getHostRow(host);
    if (!hostRow) return;

    const title = clean(row.title || row.pageTitle || row.sourceTitle);
    const text = [
      host,
      url,
      title,
      row.snippet,
      row.sourceClass,
      row.truthRole,
      row.reviewerDecision,
      row.fetchPurpose
    ].filter(Boolean).join(" ");

    hostRow.timesSeen += 1;
    addToSet({ leagueSlugs: hostRow.leagueSlugsSet }, "leagueSlugs", clean(row.leagueSlug));
    addToSet({ dayKeys: hostRow.dayKeysSet }, "dayKeys", clean(row.dayKey));
    addToSet({ sourceClasses: hostRow.sourceClassesSet }, "sourceClasses", clean(row.sourceClass));
    addToSet({ truthRoles: hostRow.truthRolesSet }, "truthRoles", clean(row.truthRole));
    addToSet({ candidateUrls: hostRow.candidateUrlsSet }, "candidateUrls", url);

    if (title && hostRow.titles.length < 8) hostRow.titles.push(title);
    if (hasOfficialSignal(host, text)) hostRow.officialSignalCount += 1;
    if (hasFixtureListingSignal(text)) hostRow.fixtureListingSignalCount += 1;
    if (hasBettingSignal(text)) hostRow.bettingSignalCount += 1;

    if (hostRow.samples.length < 8) {
      hostRow.samples.push({
        sourceKind,
        leagueSlug: clean(row.leagueSlug),
        dayKey: clean(row.dayKey),
        sourceClass: clean(row.sourceClass),
        truthRole: clean(row.truthRole),
        title,
        url
      });
    }
  }

  function observeSnapshot(row) {
    const url = clean(row.finalUrl || row.resolvedUrl || row.url);
    const host = hostOf(row.hostname || url);
    const hostRow = getHostRow(host);
    if (!hostRow) return;

    const plainText = clean(row.plainText || row.text || row.textPreview);
    const text = [host, url, row.status, row.contentType, plainText.slice(0, 2000)].join(" ");

    hostRow.timesSeen += 1;
    addToSet({ leagueSlugs: hostRow.leagueSlugsSet }, "leagueSlugs", clean(row.leagueSlug));
    addToSet({ dayKeys: hostRow.dayKeysSet }, "dayKeys", clean(row.dayKey));
    addToSet({ candidateUrls: hostRow.candidateUrlsSet }, "candidateUrls", url);

    if (row.ok === true || Number(row.status || row.httpStatus || 0) >= 200) hostRow.fetchedOkCount += 1;
    if (hasOfficialSignal(host, text)) hostRow.officialSignalCount += 1;
    if (hasFixtureListingSignal(text)) hostRow.fixtureListingSignalCount += 1;
    if (hasBettingSignal(text)) hostRow.bettingSignalCount += 1;

    const dayKey = clean(row.dayKey);
    if (dayKey && text.includes(dayKey)) hostRow.targetDateEvidenceCount += 1;

    if (hostRow.samples.length < 8) {
      hostRow.samples.push({
        sourceKind: "snapshot",
        leagueSlug: clean(row.leagueSlug),
        dayKey,
        status: row.status ?? row.httpStatus ?? null,
        ok: row.ok ?? null,
        url
      });
    }
  }

  function observeEvidence(row) {
    const url = clean(row.finalUrl || row.resolvedUrl || row.sourceUrl || row.url);
    const host = hostOf(row.hostname || url);
    const hostRow = getHostRow(host);
    if (!hostRow) return;

    const text = JSON.stringify(row);
    hostRow.timesSeen += 1;
    hostRow.evidenceRowCount += 1;
    addToSet({ leagueSlugs: hostRow.leagueSlugsSet }, "leagueSlugs", clean(row.leagueSlug));
    addToSet({ dayKeys: hostRow.dayKeysSet }, "dayKeys", clean(row.dayKey));
    addToSet({ candidateUrls: hostRow.candidateUrlsSet }, "candidateUrls", url);

    if (hasOfficialSignal(host, text)) hostRow.officialSignalCount += 1;
    if (hasFixtureListingSignal(text)) hostRow.fixtureListingSignalCount += 1;
    if (hasBettingSignal(text)) hostRow.bettingSignalCount += 1;

    const dayKey = clean(row.dayKey);
    if (dayKey && text.includes(dayKey)) hostRow.targetDateEvidenceCount += 1;

    if (hostRow.samples.length < 8) {
      hostRow.samples.push({
        sourceKind: "evidence",
        leagueSlug: clean(row.leagueSlug),
        dayKey,
        url
      });
    }
  }

  for (const row of asArray(inputs.ranked?.rankedCandidateUrlRows)) observeCandidate(row, "rankedCandidateUrlRows");
  for (const row of asArray(inputs.validated?.validatedSearchResultRows)) observeCandidate(row, "validatedSearchResultRows");
  for (const row of asArray(inputs.validated?.validSearchResultRows)) observeCandidate(row, "validSearchResultRows");
  for (const row of asArray(inputs.review?.rankedCandidateReviewRows)) observeCandidate(row, "rankedCandidateReviewRows");
  for (const row of asArray(inputs.fetchRows?.readyForFetchRows)) observeCandidate(row, "readyForFetchRows");
  for (const row of asArray(inputs.snapshots?.fetchedSourceSnapshots)) observeSnapshot(row);
  for (const row of asArray(inputs.classified?.classifiedSourceSnapshots)) observeSnapshot(row);

  const evidenceArrays = [
    "sourceEvidenceRows",
    "fixtureEvidenceRows",
    "embeddedFixtureRows",
    "fixtureIdentityCandidateRows",
    "rows"
  ];
  for (const key of evidenceArrays) {
    for (const row of asArray(inputs.evidence?.[key])) observeEvidence(row);
  }

  const hostRows = Array.from(byHost.values()).map((row) => {
    const out = {
      host: row.host,
      timesSeen: row.timesSeen,
      leagueSlugs: Array.from(row.leagueSlugsSet).sort(),
      dayKeys: Array.from(row.dayKeysSet).sort(),
      sourceClasses: Array.from(row.sourceClassesSet).sort(),
      truthRoles: Array.from(row.truthRolesSet).sort(),
      candidateUrlCount: row.candidateUrlsSet.size,
      sampleCandidateUrls: Array.from(row.candidateUrlsSet).slice(0, 8),
      sampleTitles: row.titles,
      officialSignalCount: row.officialSignalCount,
      fixtureListingSignalCount: row.fixtureListingSignalCount,
      bettingSignalCount: row.bettingSignalCount,
      targetDateEvidenceCount: row.targetDateEvidenceCount,
      fetchedOkCount: row.fetchedOkCount,
      evidenceRowCount: row.evidenceRowCount,
      samples: row.samples
    };

    out.recommendedTier = recommendedTierForHost(out);
    out.promotionReady = false;
    out.promotionBlockedReasons = [
      "diagnostic_only_report",
      "requires_repeated_validation_before_policy_promotion",
      "no_canonical_or_source_policy_writes"
    ];

    return out;
  }).sort((a, b) => {
    if (b.bettingSignalCount !== a.bettingSignalCount) return b.bettingSignalCount - a.bettingSignalCount;
    if (b.officialSignalCount !== a.officialSignalCount) return b.officialSignalCount - a.officialSignalCount;
    if (b.fixtureListingSignalCount !== a.fixtureListingSignalCount) return b.fixtureListingSignalCount - a.fixtureListingSignalCount;
    return b.timesSeen - a.timesSeen;
  });

  const tierCounts = {};
  for (const row of hostRows) {
    tierCounts[row.recommendedTier] = (tierCounts[row.recommendedTier] || 0) + 1;
  }

  return {
    ok: true,
    mode: "fixture_source_discovery_quality_report",
    generatedAt: new Date().toISOString(),
    inputPaths: options.inputPaths || {},
    summary: {
      hostCount: hostRows.length,
      tierCounts,
      bettingSignalHostCount: hostRows.filter((row) => row.bettingSignalCount > 0).length,
      officialCandidateHostCount: hostRows.filter((row) => row.recommendedTier.startsWith("official_candidate")).length,
      supplementalCandidateHostCount: hostRows.filter((row) => row.recommendedTier.includes("supplemental")).length,
      promotionReadyCount: hostRows.filter((row) => row.promotionReady === true).length
    },
    guarantees: {
      sourceFetch: false,
      urlFetch: false,
      sourcePolicyWrites: false,
      canonicalWrites: 0,
      noCanonicalPromotion: true,
      fixtureWrites: false,
      productionWrite: false,
      dryRun: true
    },
    hostRows
  };
}

function buildReportFromPaths(args) {
  const inputs = {
    ranked: readJsonIfPresent(args.ranked),
    validated: readJsonIfPresent(args.validated),
    review: readJsonIfPresent(args.review),
    fetchRows: readJsonIfPresent(args["fetch-rows"]),
    snapshots: readJsonIfPresent(args.snapshots),
    classified: readJsonIfPresent(args.classified),
    evidence: readJsonIfPresent(args.evidence)
  };

  return summarizeHostRows(inputs, {
    inputPaths: {
      ranked: args.ranked || null,
      validated: args.validated || null,
      review: args.review || null,
      fetchRows: args["fetch-rows"] || null,
      snapshots: args.snapshots || null,
      classified: args.classified || null,
      evidence: args.evidence || null
    }
  });
}

function runSelfTest() {
  const report = summarizeHostRows({
    ranked: {
      rankedCandidateUrlRows: [
        {
          leagueSlug: "eng.1",
          dayKey: "2026-05-29",
          hostname: "premierleague.com",
          candidateUrl: "https://www.premierleague.com/fixtures",
          title: "Premier League fixtures",
          sourceClass: "official_fixture_source",
          truthRole: "primary_candidate_after_fetch_evidence"
        },
        {
          leagueSlug: "eng.1",
          dayKey: "2026-05-29",
          hostname: "flashscore.com",
          candidateUrl: "https://www.flashscore.com/football/england/premier-league/fixtures/",
          title: "Premier League fixtures schedule",
          sourceClass: "trusted_independent_fixture_listing",
          truthRole: "supplemental_crosscheck_only"
        },
        {
          leagueSlug: "eng.1",
          dayKey: "2026-05-29",
          hostname: "bbc.co.uk",
          candidateUrl: "https://www.bbc.co.uk/sport/football/premier-league/scores-fixtures",
          title: "Premier League fixtures and results",
          sourceClass: "supplemental_scoreboard_or_media",
          truthRole: "supplemental_crosscheck_only"
        },
        {
          leagueSlug: "eng.1",
          dayKey: "2026-05-29",
          hostname: "bad-betting.example",
          candidateUrl: "https://bad-betting.example/odds",
          title: "Premier League betting odds prediction",
          sourceClass: "untrusted_candidate_host",
          truthRole: "not_truth_ready"
        }
      ]
    },
    snapshots: {
      fetchedSourceSnapshots: [
        {
          leagueSlug: "eng.1",
          dayKey: "2026-05-29",
          hostname: "premierleague.com",
          finalUrl: "https://www.premierleague.com/fixtures",
          ok: true,
          status: 200,
          plainText: "Official Premier League fixtures schedule 2026-05-29 matches"
        }
      ]
    },
    evidence: {
      fixtureEvidenceRows: [
        {
          leagueSlug: "eng.1",
          dayKey: "2026-05-29",
          hostname: "premierleague.com",
          sourceUrl: "https://www.premierleague.com/fixtures",
          evidenceText: "Premier League fixtures 2026-05-29"
        }
      ]
    }
  }, { inputPaths: { selfTest: true } });

  if (!report.ok) throw new Error("self-test report must be ok");
  if (report.summary.hostCount !== 4) throw new Error(`expected 4 hosts, got ${report.summary.hostCount}`);
  if (report.summary.bettingSignalHostCount !== 1) throw new Error("expected one betting-signal host");
  if (report.summary.promotionReadyCount !== 0) throw new Error("promotionReady must be zero by default");

  const flashscoreRow = report.hostRows.find((row) => row.host === "flashscore.com");
  if (!flashscoreRow || flashscoreRow.recommendedTier !== "trusted_supplemental_candidate") {
    throw new Error(`expected flashscore.com trusted supplemental tier, got ${flashscoreRow?.recommendedTier}`);
  }

  const bbcRow = report.hostRows.find((row) => row.host === "bbc.co.uk");
  if (!bbcRow || bbcRow.recommendedTier !== "supplemental_crosscheck_candidate") {
    throw new Error(`expected bbc.co.uk supplemental crosscheck tier, got ${bbcRow?.recommendedTier}`);
  }
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false || report.guarantees.sourceFetch !== false) {
    throw new Error("read-only guarantees failed");
  }

  const tmpOut = path.join(os.tmpdir(), "aiml-fixture-source-discovery-quality-report-self-test.json");
  writeJson(tmpOut, report);

  console.log(JSON.stringify({
    ok: true,
    selfTest: "build-fixture-source-discovery-quality-report-file",
    summary: report.summary,
    guarantees: report.guarantees,
    output: tmpOut
  }, null, 2));
}

function main() {
  const args = parseArgs(process.argv);

  if (args.selfTest) {
    runSelfTest();
    return;
  }

  if (!args.output) {
    throw new Error("missing required --output");
  }

  const report = buildReportFromPaths(args);
  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();
