import fs from "fs";
import path from "path";

function parseArgs(argv) {
  const args = {
    input: "",
    output: "",
    selfTest: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i] || "";
    else if (arg === "--output") args.output = argv[++i] || "";
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

function compactText(value) {
  return asText(value).replace(/\s+/g, " ").trim();
}

function bodyTextOf(snapshot) {
  return compactText(
    snapshot.plainText ||
    snapshot.rawText ||
    snapshot.textContent ||
    snapshot.bodyText ||
    snapshot.text ||
    snapshot.html ||
    snapshot.body ||
    ""
  );
}

function statusOf(snapshot) {
  return Number(snapshot.http?.status ?? snapshot.httpStatus ?? snapshot.status ?? 0) || 0;
}

const LOW_VALUE_COMPETITION_SUPPRESSION_POLICY = {
  policyId: "football_truth_low_value_domestic_competition_suppression_v1",
  mode: "suppress_from_active_provider_discovery",
  rationale: [
    "very low product value",
    "poor official domestic standings availability",
    "high noise-to-signal fetch/probe cost",
    "do not spend recovery work on non-material domestic competitions"
  ],
  countryCodes: [
    "afg",
    "pak"
  ],
  countries: [
    "afghanistan",
    "pakistan"
  ],
  notes: [
    "This is a policy hook, not a one-off removal. Extend with additional low-value/no-data competitions after review.",
    "Small countries are not suppressed automatically: Anguilla remains eligible because it produced an official standings route."
  ]
};

function slugPrefixOf(value) {
  return asText(value).toLowerCase().split(".")[0];
}

function isSuppressedLowValueCompetition(rowOrSnapshot) {
  const leagueSlug = asText(rowOrSnapshot.leagueSlug || rowOrSnapshot.competitionSlug);
  const slugPrefix = slugPrefixOf(leagueSlug);
  const country = asText(rowOrSnapshot.country).toLowerCase();
  const name = asText(rowOrSnapshot.name).toLowerCase();
  const blob = `${leagueSlug} ${country} ${name}`.toLowerCase();

  if (LOW_VALUE_COMPETITION_SUPPRESSION_POLICY.countryCodes.includes(slugPrefix)) return true;
  if (LOW_VALUE_COMPETITION_SUPPRESSION_POLICY.countries.some((item) => blob.includes(item))) return true;

  return false;
}

function finalUrlOf(snapshot) {
  return asText(snapshot.http?.finalUrl || snapshot.finalUrl || snapshot.resolvedUrl || snapshot.candidateUrl);
}

function hostOf(snapshot) {
  return asText(snapshot.hostname || snapshot.host || snapshot.candidateHost);
}

function hasAny(text, terms) {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function countRegex(text, regex) {
  return (text.match(regex) || []).length;
}

function isNationalTeamOrFifaAssociationOnly(text, host) {
  const lower = text.toLowerCase();
  if (host.includes("inside.fifa.com")) return true;

  return (
    lower.includes("fifa/coca-cola world ranking") ||
    lower.includes("fifa world cup") ||
    lower.includes("men's ranking") ||
    lower.includes("women's ranking") ||
    lower.includes("association afghanistan confederation") ||
    lower.includes("national team")
  );
}

function classifySnapshot(snapshot) {
  const text = bodyTextOf(snapshot);
  const host = hostOf(snapshot).toLowerCase();
  const status = statusOf(snapshot);
  const finalUrl = finalUrlOf(snapshot);

  const hasOfficialIdentity = hasAny(`${host} ${text}`, [
    "football association",
    "football federation",
    "fotballforbund",
    "norges fotballforbund",
    "fédération",
    "federação",
    "federación",
    "official"
  ]);

  const standingsSignal = hasAny(`${finalUrl} ${text}`, [
    "standings",
    "standing",
    "league table",
    "points table",
    "points standing",
    "tabellen",
    "classement",
    "clasificación",
    "classifica",
    "ranglijst",
    "tabelle"
  ]);

  const competitionSignal = hasAny(`${finalUrl} ${text}`, [
    "OBOS-ligaen",
    "Anguilla",
    "Premier League",
    "Division",
    "league",
    "turnering",
    "matches/standings"
  ]);

  const seasonSignal = hasAny(text, [
    "2024",
    "2025",
    "2026",
    "season",
    "matchday",
    "round",
    "runde"
  ]);

  const tableLikeSignal =
    countRegex(text, /\bP\b|\bW\b|\bD\b|\bL\b|\bGF\b|\bGA\b|\bGD\b|\bPts\b|\bPoints\b/gi) >= 3 ||
    hasAny(text, ["played", "won", "drawn", "lost", "points"]);

  const nationalTeamOnly = isNationalTeamOrFifaAssociationOnly(text, host);

  let reviewDecision = "rejected_no_fetch_or_empty_body";
  let confidence = 0.1;
  const reasons = [];

  if (isSuppressedLowValueCompetition(snapshot)) {
    reviewDecision = "suppressed_low_value_competition";
    confidence = 0.95;
    reasons.push("Suppressed by low-value domestic competition policy before active provider-discovery recovery");
  } else if (status < 200 || status >= 300) {
    reviewDecision = "fetch_failed_or_non_200";
    confidence = 0.05;
    reasons.push(`HTTP/status not successful: ${status}`);
  } else if (!text) {
    reviewDecision = "empty_body_after_fetch";
    confidence = 0.05;
    reasons.push("No readable rawText/plainText body available");
  } else if (nationalTeamOnly) {
    reviewDecision = "official_identity_only_not_domestic_standings";
    confidence = 0.75;
    reasons.push("Official/FIFA identity page, but national-team/rankings/news content rather than domestic standings");
  } else if (hasOfficialIdentity && standingsSignal && competitionSignal && (seasonSignal || tableLikeSignal)) {
    reviewDecision = "official_standings_route_candidate";
    confidence = 0.9;
    reasons.push("Official identity plus standings/table plus competition/season/table signal");
  } else if (standingsSignal && competitionSignal) {
    reviewDecision = "standings_route_candidate_needs_identity_confirmation";
    confidence = 0.7;
    reasons.push("Standings route signal found, but official identity is not fully confirmed from body");
  } else if (hasOfficialIdentity) {
    reviewDecision = "official_identity_only_needs_standings_route_discovery";
    confidence = 0.55;
    reasons.push("Official identity found, but no validated standings table route");
  } else {
    reviewDecision = "no_usable_official_standings_signal";
    confidence = 0.25;
    reasons.push("No sufficient official standings evidence");
  }

  return {
    leagueSlug: snapshot.leagueSlug || "",
    name: snapshot.name || "",
    candidateUrl: snapshot.candidateUrl || "",
    finalUrl,
    hostname: hostOf(snapshot),
    status,
    ok: Boolean(snapshot.ok ?? snapshot.http?.ok ?? (status >= 200 && status < 300)),
    bytes: Number(snapshot.http?.bytes ?? snapshot.bytes ?? 0) || 0,
    bodyTextLength: text.length,
    bodySample: text.slice(0, 500),
    reviewDecision,
    confidence,
    evidenceSignals: {
      hasOfficialIdentity,
      standingsSignal,
      competitionSignal,
      seasonSignal,
      tableLikeSignal,
      nationalTeamOnly
    },
    reasons,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildReview(input) {
  const snapshots = asArray(input.fetchedSourceSnapshots);
  const rejectedRows = asArray(input.rejectedRows);

  const reviewedSnapshots = snapshots.map(classifySnapshot);

  const duplicateRejectedRows = rejectedRows.map((row) => {
    const suppressed = isSuppressedLowValueCompetition(row);
    return {
      leagueSlug: row.leagueSlug || "",
      candidateUrl: row.candidateUrl || "",
      hostname: row.hostname || "",
      reason: suppressed ? "suppressed_low_value_competition_duplicate" : (row.reason || "duplicate_or_rejected_by_fetch_runner"),
      sourceAction: suppressed ? "suppress_from_active_provider_discovery" : "map_to_existing_fetched_snapshot_if_same_candidateUrl",
      suppressedLowValueCompetition: suppressed,
      suppressionPolicyId: suppressed ? LOW_VALUE_COMPETITION_SUPPRESSION_POLICY.policyId : "",
      canonicalWrites: 0,
      productionWrite: false
    };
  });

  const byDecision = {};
  for (const row of reviewedSnapshots) {
    byDecision[row.reviewDecision] = (byDecision[row.reviewDecision] || 0) + 1;
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    sourceFetchSummary: input.summary || {},
    summary: {
      fetchedSnapshotCount: snapshots.length,
      rejectedCandidateCount: rejectedRows.length,
      reviewedSnapshotCount: reviewedSnapshots.length,
      officialStandingsRouteCandidateCount: reviewedSnapshots.filter((row) => row.reviewDecision === "official_standings_route_candidate").length,
      needsIdentityConfirmationCount: reviewedSnapshots.filter((row) => row.reviewDecision === "standings_route_candidate_needs_identity_confirmation").length,
      officialIdentityOnlyCount: reviewedSnapshots.filter((row) => row.reviewDecision === "official_identity_only_not_domestic_standings" || row.reviewDecision === "official_identity_only_needs_standings_route_discovery").length,
      suppressedLowValueCompetitionCount: reviewedSnapshots.filter((row) => row.reviewDecision === "suppressed_low_value_competition").length,
      duplicateSuppressedLowValueCompetitionCount: duplicateRejectedRows.filter((row) => row.suppressedLowValueCompetition === true).length,
      failedOrEmptyCount: reviewedSnapshots.filter((row) => row.reviewDecision === "fetch_failed_or_non_200" || row.reviewDecision === "empty_body_after_fetch").length,
      byDecision,
      sourceFetch: true,
      noSearch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    nextRecommendedAction: {
      type: "route_probe_review_decision",
      promoteNow: false,
      note: "No canonical promotion. Use official_standings_route_candidate rows as candidates for parser/normalization planning only."
    },
    reviewedSnapshots,
    duplicateRejectedRows,
    guarantees: {
      sourceFetchAlreadyCompleted: true,
      noSearch: true,
      noNewFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function validateReport(report) {
  if (!report.ok) throw new Error("review report is not ok");
  if (report.summary.reviewedSnapshotCount !== report.reviewedSnapshots.length) {
    throw new Error("reviewed snapshot count mismatch");
  }
  if (report.summary.canonicalWrites !== 0 || report.summary.productionWrite !== false) {
    throw new Error("canonical/production write guarantee failed");
  }
  if (report.guarantees.noCanonicalPromotion !== true) {
    throw new Error("promotion guarantee failed");
  }
}

function runSelfTest() {
  const input = {
    summary: {
      fetchedSnapshotCount: 3,
      canonicalWrites: 0,
      productionWrite: false
    },
    fetchedSourceSnapshots: [
      {
        leagueSlug: "nor.2",
        candidateUrl: "https://www.fotball.no/fotballdata/turnering/hjem/?fiksId=199422&underside=tabellen",
        hostname: "www.fotball.no",
        status: 200,
        ok: true,
        rawText: "OBOS-ligaen 2025 Norges Fotballforbund Tabellen Played Won Drawn Lost Points"
      },
      {
        leagueSlug: "afg.1",
        candidateUrl: "https://inside.fifa.com/en/associations/AFG",
        hostname: "inside.fifa.com",
        status: 200,
        ok: true,
        rawText: "Afghanistan Football Federation FIFA World Cup Qualifiers FIFA/Coca-Cola World Ranking Men Women"
      },
      {
        leagueSlug: "alg.1",
        candidateUrl: "https://www.faf.dz/",
        hostname: "www.faf.dz",
        status: 0,
        ok: false,
        rawText: ""
      }
    ],
    rejectedRows: [
      { leagueSlug: "aia.2", candidateUrl: "https://example.test/standings" }
    ]
  };

  const report = buildReview(input);
  validateReport(report);

  if (report.summary.reviewedSnapshotCount !== 3) {
    throw new Error("self-test expected 3 reviewed snapshots");
  }

  if (report.summary.officialStandingsRouteCandidateCount !== 1) {
    throw new Error("self-test expected 1 official standings route candidate");
  }

  if (report.summary.suppressedLowValueCompetitionCount !== 1) {
    throw new Error("self-test expected 1 suppressed low-value row");
  }

  if (report.summary.officialIdentityOnlyCount !== 0) {
    throw new Error("self-test expected 0 identity-only rows after suppression policy");
  }

  if (report.summary.failedOrEmptyCount !== 1) {
    throw new Error("self-test expected 1 failed/empty row");
  }

  return {
    ok: true,
    selfTest: true,
    summary: report.summary,
    guarantees: report.guarantees
  };
}

function main() {
  const args = parseArgs(process.argv);

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required");
  if (!args.output) throw new Error("--output is required");

  const input = readJson(args.input);
  const report = buildReview(input);
  validateReport(report);
  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    nextRecommendedAction: report.nextRecommendedAction,
    guarantees: report.guarantees
  }, null, 2));

  console.log("\n=== reviewed snapshots ===");
  console.table(report.reviewedSnapshots.map((row) => ({
    leagueSlug: row.leagueSlug,
    hostname: row.hostname,
    status: row.status,
    bodyTextLength: row.bodyTextLength,
    reviewDecision: row.reviewDecision,
    confidence: row.confidence
  })));

  console.log("\n=== duplicate/rejected rows ===");
  console.table(report.duplicateRejectedRows.map((row) => ({
    leagueSlug: row.leagueSlug,
    hostname: row.hostname,
    reason: row.reason
  })));
}

main();
