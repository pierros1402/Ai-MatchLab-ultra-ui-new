import fs from "fs";
import path from "path";

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    trustedBoard: "",
    output: "",
    selfTest: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--trusted-board" && argv[index + 1]) {
      args.trustedBoard = argv[++index];
      continue;
    }

    if (arg === "--output" && argv[index + 1]) {
      args.output = argv[++index];
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function unique(values) {
  return [...new Set(asArray(values).map(asText).filter(Boolean))];
}

function countBy(rows, picker) {
  return rows.reduce((acc, row) => {
    const key = asText(picker(row)) || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function normalizeTrustedCandidate(row) {
  return {
    country: asText(row.country),
    countryKey: asText(row.countryKey),
    region: asText(row.region),
    candidateHost: asText(row.candidateHost),
    representativeSlugs: unique(row.representativeSlugs),
    retryCompetitionExamples: unique(row.retryCompetitionExamples),
    candidateRowCount: Number(row.candidateRowCount || 0),
    maxConfidence: Number(row.maxConfidence || 0),
    classifications: unique(row.classifications),
    titles: unique(row.titles),
    urls: unique(row.urls),
    sourceClassifications: unique(row.sourceClassifications),
    evidenceStatus: "trusted_partial_evidence_not_canonical_truth",
    allowedUse: "derive targeted host-scoped recovery targets only",
    blockedUse: "canonical promotion or absence inference"
  };
}

function buildRecoveryRows(trustedCandidates) {
  return trustedCandidates.map((candidate) => ({
    country: candidate.country,
    countryKey: candidate.countryKey,
    region: candidate.region,
    candidateHost: candidate.candidateHost,
    representativeSlugs: candidate.representativeSlugs,
    retryCompetitionExamples: candidate.retryCompetitionExamples,
    maxConfidence: candidate.maxConfidence,
    candidateRowCount: candidate.candidateRowCount,
    recoveryLane: "trusted_partial_official_host_scoped_recovery",
    priority: 10,
    allowedNextAction: "build_host_scoped_standings_search_targets_from_trusted_candidate_host_only",
    requiresExplicitSearchApproval: true,
    requiresPostSearchHealthGate: true,
    canonicalPromotionAllowed: false,
    productionWriteAllowed: false,
    zeroResultsMayImplyAbsence: false,
    notes: [
      "Trusted host evidence is partial and must not be promoted as canonical provider truth.",
      "Host-scoped standings discovery may be attempted only from this trusted candidate host, not from zero aggregate outputs.",
      "Search output must pass searchHealth and result classification before any later Truth Engine work."
    ]
  }));
}

function buildBlockedActions(conclusion) {
  return [
    {
      action: "run_broad_full_map_live_provider_discovery_search",
      blocked: true,
      reason: "bulk/live search provider is currently unstable; repeat broad runs would amplify false-zero and low-quality results"
    },
    {
      action: "treat_zero_result_chunks_as_true_absence",
      blocked: true,
      reason: "trusted board conclusion says zero-result chunks do not imply absence"
    },
    {
      action: "build_host_scoped_standings_from_zero_aggregate",
      blocked: conclusion.doNotRunHostScopedStandingsFromZeroAggregate !== false,
      reason: "zero aggregate was contradicted by standalone offset evidence and must not seed standings workflow"
    },
    {
      action: "canonical_promotion_from_official_host_discovery_outputs",
      blocked: true,
      reason: "official-host discovery is evidence discovery only, not Truth Engine canonical confirmation"
    },
    {
      action: "daily_automation_with_canonical_writes",
      blocked: true,
      reason: "safe daily mode is not defined yet and must not promote untrusted evidence"
    }
  ];
}

function buildAllowedActions(trustedCandidates) {
  return [
    {
      action: "build_host_scoped_standings_targets_from_trusted_candidate_board",
      allowed: trustedCandidates.length > 0,
      searchRequired: false,
      fetchRequired: false,
      canonicalWrites: 0,
      productionWrite: false,
      inputContract: "trustedCandidateHostBoard from provider search health board",
      outputContract: "runner-compatible searchTargetRows with site:<trusted-host> constraints"
    },
    {
      action: "run_small_host_scoped_search_after_explicit_approval",
      allowed: trustedCandidates.length > 0,
      searchRequired: true,
      fetchRequired: false,
      canonicalWrites: 0,
      productionWrite: false,
      constraints: [
        "trusted hosts only",
        "small batch",
        "searchHealth gate required",
        "zero results do not imply absence",
        "classification required before route/fetch work"
      ]
    },
    {
      action: "define_safe_daily_mode_after_recovery_lane",
      allowed: true,
      searchRequired: false,
      fetchRequired: false,
      canonicalWrites: 0,
      productionWrite: false,
      constraints: [
        "daily after 02:00 only after safe mode is defined",
        "no canonical writes from untrusted evidence",
        "health/replay/diagnostic checks allowed before promotion lanes"
      ]
    }
  ];
}

function buildOfficialHostRecoveryPlan(trustedBoard) {
  const conclusion = trustedBoard.conclusion || {};
  const trustedCandidates = asArray(trustedBoard.trustedCandidateHostBoard)
    .map(normalizeTrustedCandidate)
    .filter((row) => row.candidateHost)
    .sort((a, b) => {
      return Number(b.maxConfidence || 0) - Number(a.maxConfidence || 0) ||
        Number(b.candidateRowCount || 0) - Number(a.candidateRowCount || 0) ||
        a.country.localeCompare(b.country) ||
        a.candidateHost.localeCompare(b.candidateHost);
    });

  const recoveryRows = buildRecoveryRows(trustedCandidates);
  const blockedActions = buildBlockedActions(conclusion);
  const allowedActions = buildAllowedActions(trustedCandidates);

  return {
    ok: true,
    job: "build-football-truth-provider-discovery-official-host-recovery-plan-file",
    mode: "read_only_health_aware_official_host_recovery_plan",
    generatedAt: new Date().toISOString(),
    inputSummary: {
      purpose: asText(trustedBoard.purpose),
      trustedSummary: trustedBoard.trustedSummary || {},
      conclusion
    },
    summary: {
      searchProviderBulkStateTrusted: conclusion.searchProviderBulkStateTrusted === true,
      offset30Contradiction: conclusion.offset30Contradiction === true,
      doNotTreatZeroResultChunksAsTrueAbsence: conclusion.doNotTreatZeroResultChunksAsTrueAbsence !== false,
      doNotRunHostScopedStandingsFromZeroAggregate: conclusion.doNotRunHostScopedStandingsFromZeroAggregate !== false,
      trustedCandidateHostCount: trustedCandidates.length,
      recoveryRowCount: recoveryRows.length,
      allowedActionCount: allowedActions.filter((row) => row.allowed === true).length,
      blockedActionCount: blockedActions.filter((row) => row.blocked === true).length,
      byRegion: countBy(trustedCandidates, (row) => row.region),
      byHost: countBy(trustedCandidates, (row) => row.candidateHost),
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    nextRecommendedAction: trustedCandidates.length > 0
      ? "Build host-scoped standings search targets from trustedCandidateHostBoard only; do not use zero aggregate."
      : "Repair search provider strategy before any host-scoped recovery.",
    trustedCandidateHostBoard: trustedCandidates,
    candidateHostBoard: trustedCandidates,
    recoveryRows,
    allowedActions,
    blockedActions,
    dailyAutomationGate: {
      requestedByUser: true,
      desiredSchedule: "daily after 02:00 Europe/Athens",
      status: "blocked_until_safe_daily_mode_defined",
      canonicalWritesAllowed: false,
      productionWriteAllowed: false,
      allowedBeforeSafeMode: [
        "health diagnostics",
        "source-index replay checks",
        "trusted-lane read-only target derivation"
      ],
      blockedBeforeSafeMode: [
        "canonical promotion from untrusted search evidence",
        "broad unstable provider search",
        "absence inference from zero results"
      ]
    },
    policy: {
      purpose: "Convert official-host search health board into explicit recovery actions and blocks.",
      inputContract: "Consumes provider-discovery official-host search provider health/trusted aggregate board.",
      noSearch: true,
      noFetch: true,
      noCanonicalWrite: true,
      noProductionWrite: true,
      noZeroResultAbsenceInference: true,
      noSingleLeagueDrift: true
    },
    guarantees: {
      diagnosticsOnly: true,
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      noCanonicalPromotion: true
    }
  };
}

function runSelfTest() {
  const trustedBoard = {
    ok: true,
    purpose: "self test",
    conclusion: {
      searchProviderBulkStateTrusted: false,
      offset30Contradiction: true,
      doNotTreatZeroResultChunksAsTrueAbsence: true,
      doNotRunHostScopedStandingsFromZeroAggregate: true
    },
    trustedSummary: {
      trustedCandidateHostCount: 2
    },
    trustedCandidateHostBoard: [
      {
        country: "Benin",
        countryKey: "benin",
        region: "africa",
        candidateHost: "febefoot.org",
        representativeSlugs: ["ben.1"],
        retryCompetitionExamples: ["ben.1", "ben.2"],
        candidateRowCount: 3,
        maxConfidence: 0.78,
        classifications: ["official_host_candidate"],
        titles: ["Homepage - Site Officiel de la Fédération Béninoise de Football (FBF)"],
        urls: ["https://febefoot.org/"]
      },
      {
        country: "Niger",
        countryKey: "niger",
        region: "africa",
        candidateHost: "fenifoot.football",
        representativeSlugs: ["nig.1"],
        retryCompetitionExamples: ["nig.1", "nig.2"],
        candidateRowCount: 3,
        maxConfidence: 0.78,
        classifications: ["official_host_candidate"],
        titles: ["Fédération Nigeriénne de Football"],
        urls: ["https://fenifoot.football/"]
      }
    ]
  };

  const plan = buildOfficialHostRecoveryPlan(trustedBoard);

  if (plan.summary.trustedCandidateHostCount !== 2) {
    throw new Error("Self-test expected 2 trusted candidate hosts");
  }

  if (plan.summary.recoveryRowCount !== 2) {
    throw new Error("Self-test expected 2 recovery rows");
  }

  if (plan.summary.searchProviderBulkStateTrusted !== false) {
    throw new Error("Self-test expected untrusted bulk state");
  }

  if (plan.summary.doNotRunHostScopedStandingsFromZeroAggregate !== true) {
    throw new Error("Self-test expected zero aggregate host-scoped block");
  }

  if (!plan.blockedActions.some((row) => row.action === "canonical_promotion_from_official_host_discovery_outputs" && row.blocked === true)) {
    throw new Error("Self-test expected canonical promotion block");
  }

  if (plan.guarantees.noSearch !== true || plan.guarantees.noFetch !== true || plan.guarantees.canonicalWrites !== 0) {
    throw new Error("Self-test read-only guarantees failed");
  }

  return {
    ok: true,
    selfTest: true,
    summary: plan.summary,
    firstRecoveryRow: plan.recoveryRows[0] || null,
    guarantees: plan.guarantees
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  if (!args.trustedBoard) throw new Error("Missing required --trusted-board");
  if (!args.output) throw new Error("Missing required --output");

  const trustedBoard = readJson(args.trustedBoard);
  const plan = buildOfficialHostRecoveryPlan(trustedBoard);

  writeJson(args.output, plan);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: plan.summary,
    nextRecommendedAction: plan.nextRecommendedAction,
    guarantees: plan.guarantees
  }, null, 2));
}

main();
