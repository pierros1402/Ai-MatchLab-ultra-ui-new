#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-13";

const DEFAULT_GATE =
  "data/football-truth/_diagnostics/standing-rows-present-truth-gate-board-2026-06-13/standing-rows-present-truth-gate-board-2026-06-13.json";

const DEFAULT_INVENTORY =
  "data/football-truth/_diagnostics/full-competition-map-inventory-2026-06-11/full-competition-map-inventory-2026-06-11.json";

const PROVIDER_EVIDENCE_RULES = {
  "eng.1": { expectedOfficialProviders: ["premierleague.com"], acceptedProviderHints: ["official_league", "premierleague"] },
  "eng.2": { expectedOfficialProviders: ["efl.com"], acceptedProviderHints: ["official_league", "efl"] },
  "eng.3": { expectedOfficialProviders: ["efl.com"], acceptedProviderHints: ["official_league", "efl"] },
  "eng.4": { expectedOfficialProviders: ["efl.com"], acceptedProviderHints: ["official_league", "efl"] },
  "eng.5": { expectedOfficialProviders: ["nationalleague.org.uk"], acceptedProviderHints: ["official_league", "nationalleague"] },
  "aut.1": { expectedOfficialProviders: ["bundesliga.at"], acceptedProviderHints: ["official_league", "bundesliga.at"] },
  "bel.1": { expectedOfficialProviders: ["proleague.be"], acceptedProviderHints: ["official_league", "proleague.be", "www.proleague.be"] },
  "arg.1": { expectedOfficialProviders: ["afa.com.ar"], acceptedProviderHints: ["official_league", "afa.com.ar", "www.afa.com.ar"] },
  "arg.2": { expectedOfficialProviders: ["afa.com.ar"], acceptedProviderHints: ["official_league", "afa.com.ar", "www.afa.com.ar"] },
  "den.1": { expectedOfficialProviders: ["superliga.dk"], acceptedProviderHints: ["official_league", "superliga"] },
  "gre.1": { expectedOfficialProviders: ["slgr.gr"], acceptedProviderHints: ["official_league", "slgr"] },
  "ita.1": { expectedOfficialProviders: ["legaseriea.it"], acceptedProviderHints: ["official_league", "legaseriea"] },
  "ita.2": { expectedOfficialProviders: ["legab.it"], acceptedProviderHints: ["official_league", "legab"] },
  "ned.1": { expectedOfficialProviders: ["eredivisie.nl"], acceptedProviderHints: ["official_league", "eredivisie"] },
  "ned.2": { expectedOfficialProviders: ["keukenkampioendivisie.nl"], acceptedProviderHints: ["official_league", "keukenkampioen"] },
  "rou.1": { expectedOfficialProviders: ["lpf.ro"], acceptedProviderHints: ["official_league", "lpf.ro"] },
  "ksa.1": { expectedOfficialProviders: ["spl.com.sa"], acceptedProviderHints: ["official_league", "spl.com.sa"] },
  "ger.3": { expectedOfficialProviders: ["dfb.de"], acceptedProviderHints: ["official_league", "dfb.de"] },
  "mex.2": { expectedOfficialProviders: ["ligabbvaexpansion.mx"], acceptedProviderHints: ["official_league", "ligabbvaexpansion", "expansion"] },
  "cyp.1": { expectedOfficialProviders: ["cfa.com.cy"], acceptedProviderHints: ["official_league", "cfa.com.cy"] },
  "sui.1": { expectedOfficialProviders: ["sfl.ch"], acceptedProviderHints: ["official_league", "sfl.ch"] },
  "usa.1": { expectedOfficialProviders: ["mlssoccer.com"], acceptedProviderHints: ["official_league", "mlssoccer"] }
};

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    gate: DEFAULT_GATE,
    inventory: DEFAULT_INVENTORY,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--gate") args.gate = argv[++i];
    else if (arg === "--inventory") args.inventory = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `standing-provider-evidence-link-board-${args.date}`,
      `standing-provider-evidence-link-board-${args.date}.json`
    );
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing JSON input: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value =
      row[key] === null || row[key] === undefined || String(row[key]).trim() === ""
        ? "__missing__"
        : String(row[key]).trim();

    counts[value] = (counts[value] || 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
  );
}

function providerMatchesHint(provider, hint) {
  return normalize(provider).includes(normalize(hint));
}

function inferEvidenceLink(row, inventoryRow) {
  const rules = PROVIDER_EVIDENCE_RULES[row.competitionSlug] || null;
  const providers = Array.isArray(inventoryRow?.providers) ? inventoryRow.providers : [];

  const matchedAcceptedHints = rules
    ? rules.acceptedProviderHints.filter((hint) =>
        providers.some((provider) => providerMatchesHint(provider, hint))
      )
    : [];

  const matchedExpectedProviders = rules
    ? rules.expectedOfficialProviders.filter((hint) =>
        providers.some((provider) => providerMatchesHint(provider, hint))
      )
    : [];

  const officialLikeProviders = Array.isArray(row.officialLikeProviders) ? row.officialLikeProviders : [];
  const hasConcreteExpectedProvider = matchedExpectedProviders.length > 0;
  const hasAcceptedProviderHint = matchedAcceptedHints.length > 0;
  const hasOnlyGenericOfficialLeague = matchedAcceptedHints.includes("official_league") && matchedAcceptedHints.length === 1;

  if (rules && hasConcreteExpectedProvider) {
    return {
      evidenceLane: "concrete_expected_provider_present",
      evidenceStatus: "candidate_for_evidence_snapshot_linking",
      evidencePriority: 10,
      blockedReason: "",
      nextAction: "link_or_build_snapshot_reference_for_expected_provider_before_write_gate",
      matchedExpectedProviders,
      matchedAcceptedHints
    };
  }

  if (rules && hasAcceptedProviderHint && !hasOnlyGenericOfficialLeague) {
    return {
      evidenceLane: "accepted_provider_hint_present",
      evidenceStatus: "needs_provider_hint_verification",
      evidencePriority: 20,
      blockedReason: "",
      nextAction: "verify_accepted_provider_hint_maps_to_concrete_official_source",
      matchedExpectedProviders,
      matchedAcceptedHints
    };
  }

  if (rules && hasOnlyGenericOfficialLeague) {
    return {
      evidenceLane: "generic_official_league_only",
      evidenceStatus: "blocked",
      evidencePriority: 50,
      blockedReason: "generic_official_league_marker_without_concrete_provider_host",
      nextAction: "resolve_concrete_provider_host_before_truth_gate",
      matchedExpectedProviders,
      matchedAcceptedHints
    };
  }

  if (!rules && officialLikeProviders.length > 0) {
    return {
      evidenceLane: "no_encoded_provider_rule_but_official_like_present",
      evidenceStatus: "needs_provider_rule",
      evidencePriority: 60,
      blockedReason: "provider_rule_not_encoded",
      nextAction: "encode_expected_official_provider_rule_before_truth_gate",
      matchedExpectedProviders: [],
      matchedAcceptedHints: []
    };
  }

  return {
    evidenceLane: "no_concrete_provider_evidence",
    evidenceStatus: "blocked",
    evidencePriority: 90,
    blockedReason: "no_concrete_provider_evidence_link",
    nextAction: "find_concrete_provider_source_before_truth_gate",
    matchedExpectedProviders: [],
    matchedAcceptedHints: []
  };
}

function main() {
  const args = parseArgs(process.argv);

  const gate = readJson(args.gate);
  const inventory = readJson(args.inventory);

  if (!Array.isArray(gate.gateRows)) throw new Error("Expected gate.gateRows array.");
  if (!Array.isArray(inventory.rows)) throw new Error("Expected inventory.rows array.");

  const inventoryBySlug = new Map(inventory.rows.map((row) => [row.competitionSlug, row]));

  const sourceRows = gate.gateRows.filter((row) =>
    row &&
    row.gateStatus === "candidate_for_scoped_truth_gate" &&
    row.gateLane === "structurally_plausible_needs_evidence_link_check"
  );

  const evidenceRows = sourceRows.map((row) => {
    const inventoryRow = inventoryBySlug.get(row.competitionSlug) || {};
    const evidence = inferEvidenceLink(row, inventoryRow);

    return {
      competitionSlug: row.competitionSlug,
      competitionType: row.competitionType,
      canonicalStandingRows: row.canonicalStandingRows,
      canonicalFixtureRows: row.canonicalFixtureRows,
      expectedStandingRowCounts: row.expectedStandingRowCounts,
      officialLikeProviderCount: row.officialLikeProviderCount,
      noiseProviderCount: row.noiseProviderCount,
      currentProviderId: row.currentProviderId,
      providerRuleEncoded: Boolean(PROVIDER_EVIDENCE_RULES[row.competitionSlug]),
      expectedOfficialProviders: PROVIDER_EVIDENCE_RULES[row.competitionSlug]?.expectedOfficialProviders || [],
      acceptedProviderHints: PROVIDER_EVIDENCE_RULES[row.competitionSlug]?.acceptedProviderHints || [],
      matchedExpectedProviders: evidence.matchedExpectedProviders,
      matchedAcceptedHints: evidence.matchedAcceptedHints,
      evidenceLane: evidence.evidenceLane,
      evidenceStatus: evidence.evidenceStatus,
      evidencePriority: evidence.evidencePriority,
      blockedReason: evidence.blockedReason,
      nextAction: evidence.nextAction,
      evidenceSnapshotLinkedNow: false,
      canonicalWriteEligibleNow: false,
      sourceFetch: false,
      searchProviderUsed: false,
      sampleProviders: Array.isArray(inventoryRow.providers) ? inventoryRow.providers.slice(0, 40) : []
    };
  }).sort((a, b) => {
    if (a.evidencePriority !== b.evidencePriority) return a.evidencePriority - b.evidencePriority;
    return a.competitionSlug.localeCompare(b.competitionSlug);
  });

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-standing-provider-evidence-link-board-file",
    mode: "source_only_provider_evidence_link_board_no_search_no_fetch_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      gate: args.gate,
      inventory: args.inventory,
      sourceCandidateGateRowCount: sourceRows.length
    },
    summary: {
      sourceCandidateGateRowCount: sourceRows.length,
      evidenceRowCount: evidenceRows.length,
      candidateForEvidenceSnapshotLinkingCount: evidenceRows.filter((row) => row.evidenceStatus === "candidate_for_evidence_snapshot_linking").length,
      needsProviderHintVerificationCount: evidenceRows.filter((row) => row.evidenceStatus === "needs_provider_hint_verification").length,
      needsProviderRuleCount: evidenceRows.filter((row) => row.evidenceStatus === "needs_provider_rule").length,
      blockedCount: evidenceRows.filter((row) => row.evidenceStatus === "blocked").length,
      evidenceSnapshotLinkedNowCount: 0,
      canonicalWriteEligibleNowCount: 0,
      sourceFetch: false,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane:
        evidenceRows.some((row) => row.evidenceStatus === "candidate_for_evidence_snapshot_linking")
          ? "build_snapshot_linking_plan_for_concrete_expected_provider_present_rows"
          : "encode_provider_rules_or_resolve_provider_hosts_before_truth_gate"
    },
    counts: {
      byEvidenceLane: countBy(evidenceRows, "evidenceLane"),
      byEvidenceStatus: countBy(evidenceRows, "evidenceStatus"),
      byBlockedReason: countBy(evidenceRows.filter((row) => row.blockedReason), "blockedReason")
    },
    guardrails: [
      "This board does not fetch or search.",
      "Concrete expected provider presence is still not truth until linked to a valid snapshot/evidence artifact.",
      "canonicalWriteEligibleNow remains false for every row.",
      "Generic official_league markers are blocked unless a concrete host/provider is identified."
    ],
    evidenceRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    sourceCandidateGateRowCount: output.summary.sourceCandidateGateRowCount,
    evidenceRowCount: output.summary.evidenceRowCount,
    candidateForEvidenceSnapshotLinkingCount: output.summary.candidateForEvidenceSnapshotLinkingCount,
    needsProviderHintVerificationCount: output.summary.needsProviderHintVerificationCount,
    needsProviderRuleCount: output.summary.needsProviderRuleCount,
    blockedCount: output.summary.blockedCount,
    canonicalWriteEligibleNowCount: output.summary.canonicalWriteEligibleNowCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
}

main();
