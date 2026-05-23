import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return value == null ? "" : String(value);
}

function norm(value) {
  return text(value).replace(/\s+/g, " ").trim();
}

function safeKeyPart(value) {
  return norm(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text(value));
}

function canonicalWriteTarget(dayKey, leagueSlug) {
  return `data/canonical-fixtures/${dayKey}/${leagueSlug}.json`;
}

function candidateFixtureId(row) {
  const sourceMatchId = safeKeyPart(row.sourceMatchId);
  if (sourceMatchId) {
    return `verified-${safeKeyPart(row.leagueSlug)}-${sourceMatchId}`;
  }

  return [
    "verified",
    safeKeyPart(row.leagueSlug),
    safeKeyPart(row.localDate),
    safeKeyPart(row.localTime),
    safeKeyPart(row.homeTeam),
    safeKeyPart(row.awayTeam)
  ].filter(Boolean).join("-");
}

function readProposalRows(proposalPath) {
  if (!proposalPath) return [];
  const proposal = readJson(proposalPath);
  return asArray(proposal.proposals);
}

function firstBySlug(rows) {
  const map = new Map();
  for (const row of rows) {
    const slug = norm(row.leagueSlug);
    if (!slug) continue;
    if (!map.has(slug)) map.set(slug, row);
  }
  return map;
}

function main() {
  const args = parseArgs(process.argv);
  const input = text(args.input);
  const output = text(args.output);
  const proposalPath = text(args.proposals || args.proposal);
  const dayKey = text(args.date || args.dayKey);

  if (!input) throw new Error("--input is required");
  if (!output) throw new Error("--output is required");
  if (!isDate(dayKey)) throw new Error("--date YYYY-MM-DD is required");
  if (!fs.existsSync(input)) throw new Error(`Missing validation input: ${input}`);
  if (proposalPath && !fs.existsSync(proposalPath)) throw new Error(`Missing proposals input: ${proposalPath}`);

  const validation = readJson(input);
  const proposalRows = readProposalRows(proposalPath);
  const proposalBySlug = firstBySlug(proposalRows);

  const validRows = asArray(validation.validFixtureIdentityRows);
  const rejectedValidationRows = asArray(validation.rejectedFixtureIdentityRows);

  const proposedCanonicalFixtureRows = validRows.map((row, index) => {
    const leagueSlug = norm(row.leagueSlug);
    const proposal = proposalBySlug.get(leagueSlug) || {};

    return {
      planRowId: `${dayKey}:${leagueSlug}:${index + 1}`,
      reviewState: "ready_for_dry_run_canonical_fixture_addition",
      dryRun: true,
      productionWrite: false,
      canonicalWrites: 0,
      writeTarget: canonicalWriteTarget(dayKey, leagueSlug),
      proposedCanonicalFixture: {
        id: candidateFixtureId(row),
        date: dayKey,
        leagueSlug,
        leagueName: norm(row.name || proposal.name),
        country: norm(row.country || proposal.country),
        homeTeam: norm(row.homeTeam),
        awayTeam: norm(row.awayTeam),
        localDate: norm(row.localDate),
        localTime: norm(row.localTime),
        kickoffUtc: norm(row.kickoffUtc),
        status: "PRE",
        acquisitionState: "verified_fixture_identity_validated_dry_run",
        sourceProvider: norm(row.provider),
        sourceMatchId: norm(row.sourceMatchId),
        sourceUrl: norm(row.sourceUrl),
        sourceSnapshotId: norm(row.sourceSnapshotId),
        extractionMethod: norm(row.extractionMethod),
        dateConfidence: norm(row.dateConfidence)
      },
      sourceEvidence: {
        provider: norm(row.provider),
        sourceUrl: norm(row.sourceUrl),
        sourceSnapshotId: norm(row.sourceSnapshotId),
        sourceMatchId: norm(row.sourceMatchId),
        validationInput: input,
        proposalInput: proposalPath || ""
      },
      proposalContext: {
        originalReviewState: norm(proposal.reviewState),
        originalBlockedReason: norm(proposal.blockedReason),
        originalAction: norm(proposal.action)
      }
    };
  });

  const readySlugs = new Set(proposedCanonicalFixtureRows.map((row) => row.proposedCanonicalFixture.leagueSlug));
  const blockedProposalRows = [];

  for (const row of proposalRows) {
    const slug = norm(row.leagueSlug);
    if (!slug) continue;
    if (readySlugs.has(slug)) continue;

    blockedProposalRows.push({
      leagueSlug: slug,
      name: norm(row.name),
      country: norm(row.country),
      reviewState: norm(row.reviewState),
      blockedReason: norm(row.blockedReason) || "not_ready_for_canonical_write",
      nextAction: norm(row.blockedReason) === "deploy_snapshot_already_has_fixtures"
        ? "skip_or_compare_against_existing_deploy_snapshot_fixtures"
        : "remediate_source_or_confirm_no_target_date_fixtures",
      writeTarget: canonicalWriteTarget(dayKey, slug),
      dryRun: true,
      productionWrite: false,
      canonicalWrites: 0
    });
  }

  const proposedLeagueSlugs = new Set(proposedCanonicalFixtureRows.map((row) => row.proposedCanonicalFixture.leagueSlug));
  const blockedLeagueSlugs = new Set(blockedProposalRows.map((row) => row.leagueSlug));

  const report = {
    ok: true,
    job: "build-verified-fixture-acquisition-promotion-plan-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_verified_fixture_acquisition_promotion_plan",
    dryRun: true,
    sourceInput: {
      validationInput: input,
      proposalInput: proposalPath || "",
      dayKey
    },
    summary: {
      validFixtureIdentityRowCount: validRows.length,
      rejectedFixtureIdentityRowCount: rejectedValidationRows.length,
      proposedCanonicalFixtureRowCount: proposedCanonicalFixtureRows.length,
      proposedCanonicalFixtureLeagueCount: proposedLeagueSlugs.size,
      blockedProposalRowCount: blockedProposalRows.length,
      blockedProposalLeagueCount: blockedLeagueSlugs.size,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      deploySnapshotWrites: false,
      valueWrites: false,
      detailsWrites: false,
      productionWrite: false,
      dryRun: true
    },
    proposedCanonicalFixtureRows,
    blockedProposalRows,
    rejectedValidationRows,
    notes: [
      "Dry-run plan only: this file does not write canonical fixtures.",
      "A later guarded writer must require explicit apply flags and should consume only proposedCanonicalFixtureRows after separate review.",
      "Blocked proposal rows remain non-writable until target-date match-level identity exists or existing snapshot fixtures are reconciled."
    ]
  };

  writeJson(output, report);

  console.log(JSON.stringify({
    ok: true,
    output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();