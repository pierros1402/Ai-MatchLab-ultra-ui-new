#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv = process.argv) {
  const args = {
    input: "",
    output: "",
    date: "",
    caseSlugs: "",
    allCases: false,
    selfTest: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--input" && argv[i + 1]) {
      args.input = String(argv[++i] || "").trim();
      continue;
    }

    if (arg.startsWith("--input=")) {
      args.input = arg.slice("--input=".length).trim();
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = String(argv[++i] || "").trim();
      continue;
    }

    if (arg.startsWith("--output=")) {
      args.output = arg.slice("--output=".length).trim();
      continue;
    }

    if ((arg === "--date" || arg === "--day") && argv[i + 1]) {
      args.date = String(argv[++i] || "").trim();
      continue;
    }

    if (arg.startsWith("--date=")) {
      args.date = arg.slice("--date=".length).trim();
      continue;
    }

    if (arg === "--all-cases") {
      args.allCases = true;
      continue;
    }

    if ((arg === "--case-slugs" || arg === "--cases") && argv[i + 1]) {
      args.caseSlugs = String(argv[++i] || "").trim();
      continue;
    }

    if (arg.startsWith("--case-slugs=")) {
      args.caseSlugs = arg.slice("--case-slugs=".length).trim();
      continue;
    }
  }

  return args;
}

function readJson(filePath) {
  if (!filePath) throw new Error("missing --input");
  if (!fs.existsSync(filePath)) throw new Error(`missing input file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  if (!filePath) throw new Error("missing --output");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function unique(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function compactObject(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function sourceFamilyPolicy(row) {
  const blockedHosts = unique(row?.adapter?.blockedHosts || []);
  const fetchedHost = String(row?.fetch?.host || "").trim();
  const resolvedHost = String(row?.adapter?.resolvedHost || "").trim();
  const fetchedUrl = String(row?.fetch?.finalUrl || "").trim();
  const resolvedUrl = String(row?.adapter?.resolvedUrl || "").trim();
  const blockedSampleUrl = String(row?.adapter?.blockedSampleUrl || "").trim();

  return {
    excludedHosts: unique([
      "www.betexplorer.com"
    ]),
    previouslyBlockedHosts: unique([
      ...blockedHosts,
      fetchedHost,
      resolvedHost
    ]),
    avoidUrlFamilies: unique([
      fetchedUrl,
      resolvedUrl,
      blockedSampleUrl
    ]),
    avoidGenericLandingPages: true,
    allowOfficialLeagueSources: true,
    allowOfficialClubCalendarSources: true,
    allowTrustedIndependentStructuredSources: true,
    requireSourceSpecificityBeforeFetch: true
  };
}

function questionFor(row) {
  const name = row?.name || row?.leagueSlug || "league";
  const date = row?.targetDate || "target date";
  return `What fixtures, if any, exist for ${name} on ${date}?`;
}

function buildQueries(row) {
  const name = row?.name || row?.leagueSlug || "";
  const date = row?.targetDate || "";
  const slug = row?.leagueSlug || "";
  const base = [
    `"${name}" "${date}" fixtures official`,
    `"${name}" "${date}" matches official calendar`,
    `"${name}" fixtures ${date} league official`,
    `"${name}" ${date} club fixtures`
  ];

  if (slug === "bel.1") {
    base.push(`"Jupiler Pro League" "${date}" fixtures official`);
  } else if (slug === "esp.1") {
    base.push(`"LaLiga" "${date}" fixtures official`);
  } else if (slug === "srb.1") {
    base.push(`"Serbian SuperLiga" "${date}" fixtures official`);
    base.push(`"Super Liga Srbije" "${date}" raspored`);
  }

  return unique(base.map((query) => `${query} -site:www.betexplorer.com`));
}

function evidenceRequirements(row) {
  return [
    {
      id: "official_or_primary_calendar",
      description: "Find an official league calendar, official competition fixtures page, or official club calendar evidence for the target date.",
      required: true
    },
    {
      id: "independent_second_source",
      description: "Find a second non-excluded source that independently confirms the fixture list or confirms no fixture exists on the target date.",
      required: true
    },
    {
      id: "match_identity_fields",
      description: "Evidence must include match-level identity where fixtures exist: home team, away team, local date, and preferably kickoff time.",
      required: true
    },
    {
      id: "negative_evidence_rule",
      description: "If no fixture exists, evidence must be explicit calendar absence or two independent sources agreeing there is no fixture on the target date.",
      required: true
    }
  ];
}

function discoveryPlanFor(row) {
  const status = row?.analystStatus || "NEEDS_ANALYST_REVIEW";

  if (status === "BLOCKED_BY_EXCLUDED_HOST_ONLY") {
    return {
      strategy: "official_first_then_independent",
      reason: "Existing automated candidates only repeated excluded source family.",
      steps: [
        "Search official league fixtures/calendar source first.",
        "Search official club calendars only if league calendar is not specific enough.",
        "Search a different independent trusted provider only after official source candidate is identified.",
        "Reject BetExplorer and avoid repeating the exact previously failed URL families; do not exclude official hosts wholesale."
      ]
    };
  }

  if (status === "LANDING_PAGE_NOT_USABLE") {
    return {
      strategy: "date_specific_structured_source_required",
      reason: "Generic landing page fetched successfully but did not expose match-level fixture identity rows.",
      steps: [
        "Do not fetch the same generic home/fixtures landing URL again; avoid the exact failed URL family rather than excluding the official host.",
        "Search for a date-specific, season-specific, or structured calendar page.",
        "Prefer URLs that visibly encode fixtures, match centre, schedule, calendar, or API-backed calendar pages.",
        "Only fetch after source specificity is established."
      ]
    };
  }

  if (status === "NEEDS_REPLACEMENT_URL") {
    return {
      strategy: "replace_broken_url",
      reason: "Resolved URL returned HTTP 404 or otherwise unusable response.",
      steps: [
        "Find replacement official or trusted source URL.",
        "Reject the broken URL and same broken path family; do not exclude the whole official host if a better path exists.",
        "Validate replacement URL before fetch.",
        "Then re-run controlled fetch only for the replacement."
      ]
    };
  }

  return {
    strategy: "manual_analyst_review",
    reason: "No safe automated route classified this league yet.",
    steps: [
      "Review previous source chain.",
      "Search official and independent source candidates.",
      "Classify source specificity before fetch."
    ]
  };
}

function acceptanceCriteria(row) {
  return {
    canPromoteToVerifiedFixtures: [
      "official source and independent source agree on match identity",
      "home/away teams are unambiguous",
      "local date equals targetDate",
      "source is not excluded and is not a generic landing page"
    ],
    canPromoteToVerifiedNoFixture: [
      "official calendar has no match on targetDate and second independent source agrees",
      "or official source explicitly states no scheduled fixture on targetDate",
      "no conflicting source has targetDate fixtures"
    ],
    mustStayNeedsReview: [
      "only one source found",
      "only generic landing pages found",
      "source has no match-level rows",
      "date/team identity is ambiguous",
      "sources conflict"
    ],
    canonicalWrites: 0,
    productionWrite: false
  };
}

function failureStopRule(row) {
  const status = row?.analystStatus || "";
  if (status === "LANDING_PAGE_NOT_USABLE") {
    return "Stop after two generic landing-page candidates; switch to official calendar or structured source discovery.";
  }
  if (status === "BLOCKED_BY_EXCLUDED_HOST_ONLY") {
    return "Stop if the only candidates are from excluded host families; require official/club calendar candidate.";
  }
  if (status === "NEEDS_REPLACEMENT_URL") {
    return "Stop if replacement URL is not HTTP 200 or is another generic landing page.";
  }
  return "Stop if evidence cannot answer the league/date question directly.";
}

function selectRepresentativeRows(rows, requestedSlugs, allCases = false) {
  if (allCases) {
    return rows;
  }

  if (requestedSlugs.length > 0) {
    const requestedSet = new Set(requestedSlugs);
    return rows.filter((row) => requestedSet.has(row.leagueSlug));
  }

  const wantedStatuses = [
    "BLOCKED_BY_EXCLUDED_HOST_ONLY",
    "LANDING_PAGE_NOT_USABLE",
    "NEEDS_REPLACEMENT_URL"
  ];

  const preferredSlugByStatus = {
    BLOCKED_BY_EXCLUDED_HOST_ONLY: "bel.1",
    LANDING_PAGE_NOT_USABLE: "esp.1",
    NEEDS_REPLACEMENT_URL: "srb.1"
  };

  const selected = [];

  for (const status of wantedStatuses) {
    const preferredSlug = preferredSlugByStatus[status];
    const preferred = rows.find((row) => row.analystStatus === status && row.leagueSlug === preferredSlug);
    const fallback = rows.find((row) => row.analystStatus === status);
    const row = preferred || fallback;
    if (row) selected.push(row);
  }

  return selected;
}

function buildWorkset(input, options = {}) {
  const targetDate = options.date || input?.targetDate || "2026-05-22";
  const rows = Array.isArray(input?.rows) ? input.rows : [];
  const requestedSlugs = unique(String(options.caseSlugs || "").split(","));
  const allCases = options.allCases === true;

  if (rows.length === 0) {
    throw new Error("input analyst matrix has no rows[]");
  }

  const selectedRows = selectRepresentativeRows(rows, requestedSlugs, allCases);

  if (selectedRows.length === 0) {
    throw new Error("no analyst cases selected");
  }

  const cases = selectedRows.map((row) => ({
    caseId: `fixture_league_date_acquisition_analyst:${targetDate}:${row.leagueSlug}`,
    leagueSlug: row.leagueSlug,
    name: row.name || "",
    targetDate,
    previousAnalystStatus: row.analystStatus || "",
    question: questionFor({ ...row, targetDate }),
    knownFailure: {
      status: row.analystStatus || "",
      conclusion: row.conclusion || "",
      previousNextAction: row.nextAction || "",
      fetch: compactObject(row.fetch),
      extraction: compactObject(row.extraction),
      adapter: compactObject(row.adapter)
    },
    sourcePolicy: sourceFamilyPolicy(row),
    discoveryPlan: discoveryPlanFor(row),
    suggestedQueries: buildQueries({ ...row, targetDate }),
    evidenceRequirements: evidenceRequirements(row),
    acceptanceCriteria: acceptanceCriteria(row),
    stopRule: failureStopRule(row),
    outputDecisionSchema: {
      allowedDecisions: [
        "verified_fixtures",
        "verified_no_fixture_on_target_date",
        "needs_review",
        "conflicting_evidence",
        "source_blocked_or_unusable"
      ],
      requiredFieldsForVerifiedFixtures: [
        "leagueSlug",
        "targetDate",
        "fixtures[].homeTeam",
        "fixtures[].awayTeam",
        "fixtures[].localDate",
        "sources[]"
      ],
      requiredFieldsForVerifiedNoFixture: [
        "leagueSlug",
        "targetDate",
        "sources[]",
        "negativeEvidenceReason"
      ]
    },
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  }));

  const byStatus = {};
  for (const item of cases) {
    byStatus[item.previousAnalystStatus] = (byStatus[item.previousAnalystStatus] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-fixture-league-date-acquisition-analyst-workset-file",
    generatedAt: new Date().toISOString(),
    mode: "question_first_fixture_acquisition_analyst_workset",
    targetDate,
    sourceInput: options.input || "",
    summary: {
      inputLeagueCount: rows.length,
      selectedCaseCount: cases.length,
      byStatus,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    cases,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noSearchSideEffects: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    notes: [
      "This job does not resolve URLs or fetch pages.",
      "It converts failed URL-first artifacts into league/date analyst questions.",
      "The next implementation step should execute discovery against these questions, not against generic landing URLs."
    ]
  };
}

function selfTest() {
  const input = {
    targetDate: "2026-05-22",
    rows: [
      {
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        targetDate: "2026-05-22",
        analystStatus: "BLOCKED_BY_EXCLUDED_HOST_ONLY",
        nextAction: "search official league/club calendars or a different independent trusted provider",
        adapter: { blockedHosts: ["www.betexplorer.com"], reason: "only_excluded_host_candidates" }
      },
      {
        leagueSlug: "esp.1",
        name: "LaLiga",
        targetDate: "2026-05-22",
        analystStatus: "LANDING_PAGE_NOT_USABLE",
        nextAction: "do not fetch more generic landing pages",
        fetch: { host: "flashscore.co.za", httpStatus: 200, httpOk: true },
        extraction: { rejectedSnapshot: true, rejectionReason: "no_match_level_fixture_identity_rows_extracted" }
      },
      {
        leagueSlug: "srb.1",
        name: "Serbian SuperLiga",
        targetDate: "2026-05-22",
        analystStatus: "NEEDS_REPLACEMENT_URL",
        nextAction: "find another official or trusted source URL",
        fetch: { host: "flashscore.co.za", httpStatus: 404, httpOk: false }
      }
    ]
  };

  const report = buildWorkset(input, { date: "2026-05-22" });

  if (report.summary.selectedCaseCount !== 3) {
    throw new Error(`self-test failed: expected 3 cases, got ${report.summary.selectedCaseCount}`);
  }

  if (report.cases.some((item) => !item.question || !item.evidenceRequirements?.length || !item.acceptanceCriteria)) {
    throw new Error("self-test failed: analyst case is missing question/evidence/criteria");
  }

  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false || report.guarantees.noFetch !== true) {
    throw new Error("self-test failed: safety guarantees missing");
  }

  return report;
}

async function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-fixture-league-date-acquisition-analyst-workset-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error("--date YYYY-MM-DD is required");
  }

  const input = readJson(args.input);
  const report = buildWorkset(input, {
    input: args.input,
    date: args.date,
    caseSlugs: args.caseSlugs,
    allCases: args.allCases
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    job: "build-fixture-league-date-acquisition-analyst-workset-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
});
