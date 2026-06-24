#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-13";

const DEFAULT_EVIDENCE =
  "data/football-truth/_diagnostics/standing-provider-evidence-link-board-2026-06-13/standing-provider-evidence-link-board-2026-06-13.json";

const DEFAULT_DIAGNOSTICS_ROOT =
  "data/football-truth/_diagnostics";

const EXCLUDED_DIR_PARTS = [
  "standing-provider-snapshot-linking-plan-",
  "standing-provider-evidence-link-board-",
  "standing-rows-present-truth-gate-board-",
  "autonomous-truth-review-board-",
  "autonomous-competition-resolution-loop-",
  "host-scoped-recovery-targets-",
  "full-competition-map-inventory-"
];

const SNAPSHOT_ARRAY_KEYS = [
  "fetchedSourceSnapshots",
  "snapshots",
  "snapshotRows",
  "fetchSnapshots",
  "rows"
];

const STANDING_CONTEXT_MARKERS = [
  "standings",
  "standing",
  "table",
  "league table",
  "position",
  "played",
  "points",
  "pts",
  "won",
  "drawn",
  "lost",
  "goals",
  "team"
];

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    evidence: DEFAULT_EVIDENCE,
    diagnosticsRoot: DEFAULT_DIAGNOSTICS_ROOT,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--evidence") args.evidence = argv[++i];
    else if (arg === "--diagnostics-root") args.diagnosticsRoot = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `standing-provider-snapshot-linking-plan-${args.date}`,
      `standing-provider-snapshot-linking-plan-${args.date}.json`
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

function listJsonFiles(root) {
  const out = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const normalized = full.replaceAll("\\", "/");

      if (entry.isDirectory()) {
        if (EXCLUDED_DIR_PARTS.some((part) => normalized.includes(part))) continue;
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        out.push(full);
      }
    }
  }

  walk(root);
  return out.sort();
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

function compactText(value, max = 1200) {
  return String(value || "").replace(/\s+/g, " ").slice(0, max);
}

function rowText(row) {
  return normalize([
    row.url,
    row.sourceUrl,
    row.candidateUrl,
    row.checkedSourceUrl,
    row.finalUrl,
    row.routeUrl,
    row.contentType,
    row.plainText,
    row.rawText,
    row.text,
    row.html,
    row.body,
    row.context
  ].filter(Boolean).join(" "));
}

function rowUrlText(row) {
  return normalize([
    row.url,
    row.sourceUrl,
    row.candidateUrl,
    row.checkedSourceUrl,
    row.finalUrl,
    row.routeUrl
  ].filter(Boolean).join(" "));
}

function hasProvider(row, providers) {
  const urlText = rowUrlText(row);
  const text = rowText(row);

  return providers.some((provider) => {
    const p = normalize(provider);
    return p && (urlText.includes(p) || text.includes(p));
  });
}

function hasStandingContext(row) {
  const text = rowText(row);
  return STANDING_CONTEXT_MARKERS.some((marker) => text.includes(marker));
}

function hasSuccessfulFetchShape(row) {
  const status = row.status ?? row.httpStatus ?? row.statusCode;
  if (status === 200 || status === "200") return true;

  const rawLength = Number(row.rawTextLength || 0);
  const plainLength = Number(row.plainTextLength || 0);
  const textLength = normalize(row.rawText || row.plainText || row.text || row.html || row.body).length;

  return rawLength > 0 || plainLength > 0 || textLength > 200;
}

function extractSnapshotLikeRows(value, filePath, pointer = "", out = []) {
  if (value === null || value === undefined) return out;

  if (Array.isArray(value)) {
    const key = pointer.split(".").pop()?.replace(/\[\d+\]$/, "");
    const parentKey = key || "";

    value.forEach((child, index) => {
      const childPointer = `${pointer}[${index}]`;

      if (
        child &&
        typeof child === "object" &&
        !Array.isArray(child) &&
        (
          SNAPSHOT_ARRAY_KEYS.some((k) => pointer.includes(k)) ||
          "rawText" in child ||
          "plainText" in child ||
          "sourceUrl" in child ||
          "candidateUrl" in child ||
          "checkedSourceUrl" in child ||
          "status" in child
        )
      ) {
        out.push({
          filePath,
          pointer: childPointer,
          row: child
        });
      }

      extractSnapshotLikeRows(child, filePath, childPointer, out);
    });

    return out;
  }

  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      extractSnapshotLikeRows(child, filePath, pointer ? `${pointer}.${key}` : key, out);
    }
  }

  return out;
}

function classifySnapshotMatch(snapshot, expectedProviders) {
  const providerPresent = hasProvider(snapshot.row, expectedProviders);
  const standingContextPresent = hasStandingContext(snapshot.row);
  const successfulFetchShape = hasSuccessfulFetchShape(snapshot.row);

  if (providerPresent && standingContextPresent && successfulFetchShape) {
    return {
      matchClass: "strict_provider_standing_snapshot_candidate",
      linkUsableForNextReview: true,
      reason: ""
    };
  }

  if (providerPresent && successfulFetchShape) {
    return {
      matchClass: "provider_snapshot_without_standing_context",
      linkUsableForNextReview: false,
      reason: "provider_present_but_no_standing_context"
    };
  }

  if (providerPresent) {
    return {
      matchClass: "provider_reference_without_fetch_shape",
      linkUsableForNextReview: false,
      reason: "provider_present_but_no_fetch_shape"
    };
  }

  return {
    matchClass: "not_matching_expected_provider",
    linkUsableForNextReview: false,
    reason: "expected_provider_not_present"
  };
}

function inferLinkStatus(strictMatches, weakProviderMatches) {
  if (strictMatches.length > 0) {
    return {
      snapshotLinkStatus: "strict_provider_standing_snapshot_candidate_found",
      nextAction: "review_strict_snapshot_candidate_for_concrete_standing_evidence",
      blockedReason: ""
    };
  }

  if (weakProviderMatches.length > 0) {
    return {
      snapshotLinkStatus: "provider_snapshot_present_but_no_standing_context",
      nextAction: "prepare_scoped_standings_fetch_input_for_expected_provider_if_user_approves_fetch",
      blockedReason: "no_local_standing_context_for_expected_provider"
    };
  }

  return {
    snapshotLinkStatus: "no_strict_local_snapshot_found",
    nextAction: "prepare_scoped_standings_fetch_input_for_expected_provider_if_user_approves_fetch",
    blockedReason: "no_local_expected_provider_snapshot_found"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const evidence = readJson(args.evidence);

  if (!Array.isArray(evidence.evidenceRows)) throw new Error("Expected evidence.evidenceRows array.");

  const sourceRows = evidence.evidenceRows.filter((row) =>
    row &&
    row.evidenceStatus === "candidate_for_evidence_snapshot_linking" &&
    row.evidenceLane === "concrete_expected_provider_present"
  );

  const files = listJsonFiles(args.diagnosticsRoot);
  const allSnapshotRows = [];

  for (const filePath of files) {
    let parsed;
    try {
      parsed = readJson(filePath);
    } catch {
      continue;
    }

    extractSnapshotLikeRows(parsed, filePath, "", allSnapshotRows);
  }

  const linkRows = [];

  for (const row of sourceRows) {
    const expectedProviders = Array.isArray(row.expectedOfficialProviders)
      ? row.expectedOfficialProviders
      : [];

    const providerMatches = [];
    const strictMatches = [];

    for (const snapshot of allSnapshotRows) {
      const classified = classifySnapshotMatch(snapshot, expectedProviders);

      if (classified.matchClass !== "not_matching_expected_provider") {
        providerMatches.push({
          filePath: snapshot.filePath,
          pointer: snapshot.pointer,
          matchClass: classified.matchClass,
          reason: classified.reason,
          status: snapshot.row.status ?? snapshot.row.httpStatus ?? snapshot.row.statusCode ?? null,
          sourceUrl: snapshot.row.sourceUrl || snapshot.row.candidateUrl || snapshot.row.checkedSourceUrl || snapshot.row.url || snapshot.row.finalUrl || snapshot.row.routeUrl || "",
          contentType: snapshot.row.contentType || "",
          rawTextLength: snapshot.row.rawTextLength || null,
          plainTextLength: snapshot.row.plainTextLength || null,
          context: compactText(snapshot.row.plainText || snapshot.row.rawText || snapshot.row.text || snapshot.row.html || snapshot.row.body || snapshot.row.context || "", 1000)
        });
      }

      if (classified.linkUsableForNextReview) {
        strictMatches.push({
          filePath: snapshot.filePath,
          pointer: snapshot.pointer,
          matchClass: classified.matchClass,
          status: snapshot.row.status ?? snapshot.row.httpStatus ?? snapshot.row.statusCode ?? null,
          sourceUrl: snapshot.row.sourceUrl || snapshot.row.candidateUrl || snapshot.row.checkedSourceUrl || snapshot.row.url || snapshot.row.finalUrl || snapshot.row.routeUrl || "",
          contentType: snapshot.row.contentType || "",
          rawTextLength: snapshot.row.rawTextLength || null,
          plainTextLength: snapshot.row.plainTextLength || null,
          context: compactText(snapshot.row.plainText || snapshot.row.rawText || snapshot.row.text || snapshot.row.html || snapshot.row.body || snapshot.row.context || "", 1000)
        });
      }
    }

    const status = inferLinkStatus(strictMatches, providerMatches);

    linkRows.push({
      competitionSlug: row.competitionSlug,
      expectedOfficialProviders: expectedProviders,
      canonicalStandingRows: row.canonicalStandingRows,
      canonicalFixtureRows: row.canonicalFixtureRows,
      providerMatchCount: providerMatches.length,
      strictSnapshotCandidateCount: strictMatches.length,
      snapshotLinkStatus: status.snapshotLinkStatus,
      nextAction: status.nextAction,
      blockedReason: status.blockedReason,
      canonicalWriteEligibleNow: false,
      fetchRequiredIfNoStrictSnapshot: status.snapshotLinkStatus !== "strict_provider_standing_snapshot_candidate_found",
      strictSnapshotCandidates: strictMatches.slice(0, 20),
      providerMatches: providerMatches.slice(0, 20)
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-standing-provider-snapshot-linking-plan-file",
    mode: "source_only_strict_snapshot_linking_plan_no_search_no_fetch_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      evidence: args.evidence,
      diagnosticsRoot: args.diagnosticsRoot,
      scannedJsonFileCount: files.length,
      scannedSnapshotLikeRowCount: allSnapshotRows.length,
      sourceCandidateEvidenceRowCount: sourceRows.length
    },
    summary: {
      sourceCandidateEvidenceRowCount: sourceRows.length,
      linkRowCount: linkRows.length,
      strictProviderStandingSnapshotCandidateFoundCount: linkRows.filter((row) => row.snapshotLinkStatus === "strict_provider_standing_snapshot_candidate_found").length,
      providerSnapshotPresentButNoStandingContextCount: linkRows.filter((row) => row.snapshotLinkStatus === "provider_snapshot_present_but_no_standing_context").length,
      noStrictLocalSnapshotFoundCount: linkRows.filter((row) => row.snapshotLinkStatus === "no_strict_local_snapshot_found").length,
      fetchRequiredIfNoStrictSnapshotCount: linkRows.filter((row) => row.fetchRequiredIfNoStrictSnapshot).length,
      canonicalWriteEligibleNowCount: 0,
      sourceFetch: false,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane:
        linkRows.some((row) => row.snapshotLinkStatus === "strict_provider_standing_snapshot_candidate_found")
          ? "review_strict_snapshot_candidates_before_any_fetch_or_write"
          : "prepare_scoped_fetch_input_for_expected_provider_rows_if_user_approves_fetch"
    },
    counts: {
      bySnapshotLinkStatus: countBy(linkRows, "snapshotLinkStatus"),
      byBlockedReason: countBy(linkRows.filter((row) => row.blockedReason), "blockedReason")
    },
    guardrails: [
      "This strict plan only accepts snapshot-like rows where expected provider and standing/table context appear together.",
      "It does not fetch or search.",
      "A strict snapshot candidate is still not truth until reviewed by a concrete evidence validator.",
      "canonicalWriteEligibleNow remains false for every row."
    ],
    linkRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    scannedJsonFileCount: output.inputs.scannedJsonFileCount,
    scannedSnapshotLikeRowCount: output.inputs.scannedSnapshotLikeRowCount,
    sourceCandidateEvidenceRowCount: output.summary.sourceCandidateEvidenceRowCount,
    linkRowCount: output.summary.linkRowCount,
    strictProviderStandingSnapshotCandidateFoundCount: output.summary.strictProviderStandingSnapshotCandidateFoundCount,
    providerSnapshotPresentButNoStandingContextCount: output.summary.providerSnapshotPresentButNoStandingContextCount,
    noStrictLocalSnapshotFoundCount: output.summary.noStrictLocalSnapshotFoundCount,
    fetchRequiredIfNoStrictSnapshotCount: output.summary.fetchRequiredIfNoStrictSnapshotCount,
    canonicalWriteEligibleNowCount: output.summary.canonicalWriteEligibleNowCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
}

main();
