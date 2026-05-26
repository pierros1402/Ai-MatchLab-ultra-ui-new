#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv = process.argv) {
  const args = {
    input: "",
    output: "",
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
  }

  return args;
}

function readJson(filePath, label) {
  if (!filePath) throw new Error(`missing --${label}`);
  if (!fs.existsSync(filePath)) throw new Error(`missing ${label} file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  if (!filePath) throw new Error("missing --output");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asText(value) {
  return String(value || "").trim();
}

function normalizeWhitespace(value) {
  return asText(value).replace(/\s+/g, " ").trim();
}

function stripHtml(value) {
  return normalizeWhitespace(
    asText(value)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&#x27;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
  );
}

function statusOf(snapshot) {
  if (snapshot?.http && Number.isFinite(Number(snapshot.http.status))) return Number(snapshot.http.status);
  if (Number.isFinite(Number(snapshot.status))) return Number(snapshot.status);
  if (Number.isFinite(Number(snapshot.statusCode))) return Number(snapshot.statusCode);
  return null;
}

function textOf(snapshot) {
  return asText(snapshot?.http?.text || snapshot?.text || snapshot?.bodyText || snapshot?.body || "");
}

function finalUrlOf(snapshot) {
  return asText(snapshot?.http?.finalUrl || snapshot?.finalUrl || snapshot?.resolvedUrl);
}

function contentTypeOf(snapshot) {
  return asText(snapshot?.http?.contentType || snapshot?.contentType);
}

function bytesOf(snapshot) {
  const value = snapshot?.http?.bytes ?? snapshot?.contentLength ?? snapshot?.bytes ?? null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function targetDateTokens(dayKey) {
  const value = asText(dayKey);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return [value].filter(Boolean);

  const [, yyyy, mm, dd] = match;
  const monthNames = {
    "01": ["jan", "january"],
    "02": ["feb", "february"],
    "03": ["mar", "march"],
    "04": ["apr", "april"],
    "05": ["may"],
    "06": ["jun", "june"],
    "07": ["jul", "july"],
    "08": ["aug", "august"],
    "09": ["sep", "sept", "september"],
    "10": ["oct", "october"],
    "11": ["nov", "november"],
    "12": ["dec", "december"]
  };

  const dayNumber = String(Number(dd));
  const tokens = [
    `${yyyy}-${mm}-${dd}`,
    `${dd}/${mm}/${yyyy}`,
    `${dayNumber}/${Number(mm)}/${yyyy}`,
    `${dd}.${mm}.${yyyy}`,
    `${dayNumber}.${Number(mm)}.${yyyy}`,
    `${dd}-${mm}-${yyyy}`,
    `${dayNumber}-${Number(mm)}-${yyyy}`,
    `${dd}/${mm}`,
    `${dayNumber}/${Number(mm)}`,
    `${dd}.${mm}`,
    `${dayNumber}.${Number(mm)}`
  ];

  for (const month of monthNames[mm] || []) {
    tokens.push(`${dayNumber} ${month}`);
    tokens.push(`${month} ${dayNumber}`);
    tokens.push(`${dayNumber} ${month} ${yyyy}`);
    tokens.push(`${month} ${dayNumber} ${yyyy}`);
  }

  return [...new Set(tokens.map((token) => token.toLowerCase()))];
}

function hasTargetDate(text, dayKey) {
  const normalized = normalizeWhitespace(text).toLowerCase();
  return targetDateTokens(dayKey).some((token) => normalized.includes(token));
}

function hasFixtureLanguage(text) {
  const normalized = normalizeWhitespace(text).toLowerCase();

  return [
    "fixture",
    "fixtures",
    "schedule",
    "matchday",
    "matches",
    "game",
    "games",
    "terminliste",
    "jogos",
    "calendar",
    "wedstrijd",
    "wedstrijden",
    "programma",
    "calendario",
    "fikstür",
    "matç",
    "матч",
    "тур"
  ].some((token) => normalized.includes(token));
}

function hasExplicitNoFixtureLanguage(text) {
  const normalized = normalizeWhitespace(text).toLowerCase();

  return [
    "no fixtures",
    "no matches",
    "there are no matches",
    "no games",
    "no events",
    "not scheduled",
    "no scheduled matches",
    "there are currently no"
  ].some((token) => normalized.includes(token));
}

function roughTeamRowEvidence(text) {
  const normalized = normalizeWhitespace(text);

  const dashLikeRows = normalized.match(/\b[\p{L}.'’\- ]{3,}\s+(?:v|vs|versus|-|–|—)\s+[\p{L}.'’\- ]{3,}\b/giu) || [];
  const timeRows = normalized.match(/\b(?:[01]?\d|2[0-3])[:.][0-5]\d\b/g) || [];

  return {
    dashLikeRowCount: dashLikeRows.length,
    timeTokenCount: timeRows.length,
    sampleRows: dashLikeRows.slice(0, 8)
  };
}

function classifySnapshot(snapshot) {
  const status = statusOf(snapshot);
  const rawText = textOf(snapshot);
  const plainText = stripHtml(rawText);
  const dayKey = asText(snapshot.dayKey);
  const targetDateVisible = hasTargetDate(plainText, dayKey);
  const fixtureLanguageVisible = hasFixtureLanguage(plainText);
  const explicitNoFixtureEvidence = hasExplicitNoFixtureLanguage(plainText);
  const rowEvidence = roughTeamRowEvidence(plainText);

  const base = {
    taskId: asText(snapshot.taskId),
    leagueSlug: asText(snapshot.leagueSlug),
    name: asText(snapshot.name),
    dayKey,
    sourceType: asText(snapshot.sourceType),
    sourceTitle: asText(snapshot.sourceTitle),
    resolvedUrl: asText(snapshot.resolvedUrl),
    finalUrl: finalUrlOf(snapshot),
    hostname: asText(snapshot.hostname),
    status,
    contentType: contentTypeOf(snapshot),
    bytes: bytesOf(snapshot),
    targetDateVisible,
    fixtureLanguageVisible,
    explicitNoFixtureEvidence,
    dashLikeRowCount: rowEvidence.dashLikeRowCount,
    timeTokenCount: rowEvidence.timeTokenCount,
    sampleRows: rowEvidence.sampleRows,
    evidenceTextSnippet: plainText.slice(0, 700),
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };

  if (status !== 200) {
    return {
      ...base,
      classification: "rejected_candidate_http_status",
      usable: false,
      reason: `http_status_${status ?? "missing"}`
    };
  }

  if (explicitNoFixtureEvidence && targetDateVisible) {
    return {
      ...base,
      classification: "candidate_explicit_no_fixture_evidence_needs_validation",
      usable: false,
      reason: "explicit_no_fixture_language_with_target_date"
    };
  }

  if (targetDateVisible && fixtureLanguageVisible && (rowEvidence.dashLikeRowCount > 0 || rowEvidence.timeTokenCount > 0)) {
    return {
      ...base,
      classification: "candidate_fixture_evidence_needs_validation",
      usable: false,
      reason: "target_date_and_possible_fixture_rows_visible"
    };
  }

  if (fixtureLanguageVisible && !targetDateVisible) {
    return {
      ...base,
      classification: "fetched_but_not_usable_missing_target_date",
      usable: false,
      reason: "fixture_language_visible_but_target_date_not_visible"
    };
  }

  return {
    ...base,
    classification: "fetched_but_not_usable_no_fixture_evidence",
    usable: false,
    reason: "no_target_date_fixture_evidence"
  };
}

function classify(input, options = {}) {
  const snapshots = Array.isArray(input.fetchedSourceSnapshots)
    ? input.fetchedSourceSnapshots
    : [];

  const classifiedRows = snapshots.map(classifySnapshot);

  const byClassification = {};
  const byLeague = {};

  for (const row of classifiedRows) {
    byClassification[row.classification] = (byClassification[row.classification] || 0) + 1;

    byLeague[row.leagueSlug] = {
      name: row.name,
      dayKey: row.dayKey,
      classification: row.classification,
      status: row.status,
      targetDateVisible: row.targetDateVisible,
      fixtureLanguageVisible: row.fixtureLanguageVisible,
      dashLikeRowCount: row.dashLikeRowCount,
      timeTokenCount: row.timeTokenCount
    };
  }

  return {
    ok: true,
    job: "classify-fixture-league-date-source-candidate-snapshots-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_league_date_source_candidate_snapshot_classification",
    sourceInput: options.input || "",
    summary: {
      inputSnapshotCount: snapshots.length,
      classifiedRowCount: classifiedRows.length,
      candidateEvidenceNeedsValidationCount: classifiedRows.filter((row) => row.classification === "candidate_fixture_evidence_needs_validation").length,
      explicitNoFixtureNeedsValidationCount: classifiedRows.filter((row) => row.classification === "candidate_explicit_no_fixture_evidence_needs_validation").length,
      rejectedHttpStatusCount: classifiedRows.filter((row) => row.classification === "rejected_candidate_http_status").length,
      fetchedButNotUsableCount: classifiedRows.filter((row) => row.classification.startsWith("fetched_but_not_usable")).length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byClassification,
    byLeague,
    classifiedRows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noReviewDecisionApplied: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function selfTest() {
  const input = {
    fetchedSourceSnapshots: [
      {
        taskId: "ok",
        leagueSlug: "test.1",
        name: "Test League",
        dayKey: "2026-05-22",
        resolvedUrl: "https://example.test/fixtures",
        sourceType: "official_or_primary_fixture_candidate",
        sourceTitle: "Fixtures",
        hostname: "example.test",
        http: {
          status: 200,
          finalUrl: "https://example.test/fixtures",
          contentType: "text/html",
          bytes: 1000,
          text: "<html><body><h1>Fixtures</h1><div>22 May 2026</div><div>Alpha FC - Beta FC 19:30</div></body></html>"
        }
      },
      {
        taskId: "bad",
        leagueSlug: "bad.1",
        name: "Bad League",
        dayKey: "2026-05-22",
        resolvedUrl: "https://example.test/missing",
        http: {
          status: 404,
          text: "not found"
        }
      }
    ]
  };

  const report = classify(input, { input: "self-test" });

  if (report.summary.inputSnapshotCount !== 2) {
    throw new Error(`self-test failed: expected 2 snapshots, got ${report.summary.inputSnapshotCount}`);
  }

  if (report.summary.candidateEvidenceNeedsValidationCount !== 1) {
    throw new Error(`self-test failed: expected 1 candidate evidence row, got ${report.summary.candidateEvidenceNeedsValidationCount}`);
  }

  if (report.summary.rejectedHttpStatusCount !== 1) {
    throw new Error(`self-test failed: expected 1 http rejection, got ${report.summary.rejectedHttpStatusCount}`);
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
      selfTest: "classify-fixture-league-date-source-candidate-snapshots-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  const input = readJson(args.input, "input");
  const report = classify(input, { input: args.input });

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
    job: "classify-fixture-league-date-source-candidate-snapshots-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
});
