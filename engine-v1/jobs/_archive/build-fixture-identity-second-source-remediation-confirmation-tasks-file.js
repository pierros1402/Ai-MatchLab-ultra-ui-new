#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: null,
    output: null,
    date: null,
    priorityMax: null,
    selfTest: false,
    pretty: true
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--input" && argv[i + 1]) {
      args.input = cleanString(argv[++i]);
      continue;
    }
    if (arg.startsWith("--input=")) {
      args.input = cleanString(arg.slice("--input=".length));
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = cleanString(argv[++i]);
      continue;
    }
    if (arg.startsWith("--output=")) {
      args.output = cleanString(arg.slice("--output=".length));
      continue;
    }

    if (arg === "--date" && argv[i + 1]) {
      args.date = cleanString(argv[++i]);
      continue;
    }
    if (arg.startsWith("--date=")) {
      args.date = cleanString(arg.slice("--date=".length));
      continue;
    }

    if (arg === "--priority-max" && argv[i + 1]) {
      args.priorityMax = Number(argv[++i]);
      continue;
    }
    if (arg.startsWith("--priority-max=")) {
      args.priorityMax = Number(arg.slice("--priority-max=".length));
      continue;
    }

    if (arg === "--compact") {
      args.pretty = false;
      continue;
    }

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    throw new Error("Unknown argument: " + arg);
  }

  if (!args.selfTest && !args.input) {
    throw new Error("missing required --input");
  }

  if (!args.output) {
    args.output = args.input ? defaultOutputPath(args.input) : "data/football-truth/_diagnostics/fixture-acquisition-stability/self-test.fixture-identity-second-source-remediation-confirmation-tasks.json";
  }

  return args;
}

function defaultOutputPath(inputPath) {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, parsed.name + ".confirmation-tasks.json");
}

function readJson(filePath) {
  if (!filePath) throw new Error("missing required input path");
  if (!fs.existsSync(filePath)) throw new Error("Missing input: " + filePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value, pretty = true) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, pretty ? 2 : 0) + "\n", "utf8");
}

function hostFromUrl(url) {
  try {
    return new URL(cleanString(url)).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const text = cleanString(value);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function normalizeDate(value) {
  const text = cleanString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("Invalid date: " + text);
  return text;
}

function actionGoal(action) {
  if (action === "resolve_replacement_second_source_url_http_not_ok") {
    return "Find an independent date-specific second source or official calendar because the previous second-source URL returned HTTP not ok.";
  }
  if (action === "resolve_replacement_second_source_url_missing_date_signal") {
    return "Find an independent date-specific second source or official calendar because the previous second-source URL did not expose the target date signal.";
  }
  if (action === "confirm_no_target_date_fixture_or_resolve_target_date_source") {
    return "Confirm whether the league had any fixture on the target date, or find a date-specific source that proves the target-date fixture identity.";
  }
  if (action === "manual_review_or_stricter_target_date_source_required") {
    return "Find a stricter date-specific source because the previous source produced ambiguous fixture identity candidates requiring date review.";
  }
  return "Investigate the second-source state and find an independent date-specific source or no-fixture confirmation.";
}

function buildTask(row, index, date) {
  const leagueSlug = cleanString(row.leagueSlug);
  const targetDate = normalizeDate(row.targetDate || date);
  const action = cleanString(row.action);
  const sourceUrls = uniqueStrings(asArray(row.sourceUrls));
  const hosts = uniqueStrings([
    ...asArray(row.hosts),
    ...sourceUrls.map(hostFromUrl)
  ]);

  if (!leagueSlug) throw new Error("remediationRows[" + index + "]: missing leagueSlug");
  if (!action) throw new Error("remediationRows[" + index + "]: missing action");

  return {
    taskId: "fixture_identity_second_source_remediation_confirmation:" + targetDate + ":" + leagueSlug,
    taskType: "fixture_identity_second_source_or_calendar_confirmation",
    sourceRemediationAction: action,
    sourceBlockedReason: cleanString(row.blockedReason),
    priority: Number(row.priority ?? 50),
    leagueSlug,
    name: cleanString(row.name),
    targetDate,
    confirmationGoal: actionGoal(action),
    checkedSource: {
      url: sourceUrls[0] || "",
      provider: hosts[0] || "",
      sourceUrls,
      hosts,
      httpStatuses: asArray(row.httpStatuses).map(cleanString).filter(Boolean),
      evidenceReadyCount: Number(row.evidenceReadyCount ?? 0),
      evidenceNotReadyCount: Number(row.evidenceNotReadyCount ?? 0),
      candidateCount: Number(row.needsReviewFixtureIdentityCount ?? 0),
      needsReviewFixtureIdentityCount: Number(row.needsReviewFixtureIdentityCount ?? 0),
      outsideTargetDateCandidateCount: Number(row.outsideTargetDateCandidateCount ?? 0),
      needsDateReviewCandidateCount: Number(row.needsDateReviewCandidateCount ?? 0),
      targetDateCandidateCount: 0,
      hasTargetDateTextSignal: false,
      sourceEvidenceState: cleanString(row.evidenceStates ? Object.keys(row.evidenceStates)[0] : ""),
      evidenceState: cleanString(row.blockedReason),
      recommendedNextAction: action
    },
    sourceEvidence: {
      evidenceFound: Number(row.evidenceReadyCount ?? 0) > 0,
      sourceTitle: cleanString(row.name),
      finalUrl: sourceUrls[0] || "",
      hostname: hosts[0] || "",
      httpStatus: asArray(row.httpStatuses).map(cleanString).filter(Boolean)[0] || "",
      readyForReviewDecision: false
    },
    blockedSourceHints: [
      "do not use the same checked source host as the only confirmation",
      "prefer official league/club calendar, federation match center, or a trusted independent fixture source",
      "confirmation must be specific to targetDate " + targetDate
    ],
    excludedHosts: hosts,
    states: {
      confirmationState: "pending_second_source_or_calendar_confirmation",
      canonicalPromotionState: "blocked",
      sourceFetchState: "not_fetched",
      reviewDecisionState: "not_applied"
    },
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildReport(input, options = {}) {
  if (input?.ok !== true) throw new Error("Input remediation summary must have ok=true.");
  if (Number(input?.summary?.canonicalWrites ?? 0) !== 0 || input?.summary?.productionWrite === true) {
    throw new Error("Unsafe input remediation summary: writes detected.");
  }

  const date = normalizeDate(options.date || input.date || input.summary?.date);
  const rows = asArray(input.remediationRows).filter((row) => {
    if (!row) return false;
    if (row.canonicalWriteEligible === true) return false;
    if (Number.isFinite(options.priorityMax) && Number(row.priority ?? 999) > options.priorityMax) return false;
    return true;
  });

  if (rows.length === 0) throw new Error("No remediation rows available for confirmation tasks.");

  const tasks = rows.map((row, index) => buildTask(row, index, date));
  const byAction = {};
  const byLeague = {};

  for (const task of tasks) {
    byAction[task.sourceRemediationAction] = (byAction[task.sourceRemediationAction] || 0) + 1;
    byLeague[task.leagueSlug] = {
      name: task.name,
      targetDate: task.targetDate,
      action: task.sourceRemediationAction,
      priority: task.priority,
      excludedHosts: task.excludedHosts,
      checkedSourceTargetDateCandidateCount: task.checkedSource.targetDateCandidateCount
    };
  }

  return {
    ok: true,
    job: "build-fixture-identity-second-source-remediation-confirmation-tasks-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_identity_second_source_remediation_confirmation_tasks",
    targetDate: date,
    sourceInput: options.inputPath || null,
    summary: {
      inputRemediationRowCount: asArray(input.remediationRows).length,
      confirmationTaskCount: tasks.length,
      byAction,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byLeague
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
    confirmationTasks: tasks
  };
}

function selfTestInput() {
  return {
    ok: true,
    date: "2026-05-22",
    summary: {
      canonicalWrites: 0,
      productionWrite: false
    },
    remediationRows: [
      {
        leagueSlug: "ltu.1",
        name: "Lithuanian A Lyga",
        targetDate: "2026-05-22",
        priority: 20,
        action: "resolve_replacement_second_source_url_http_not_ok",
        blockedReason: "second_source_http_not_ok",
        sourceUrls: ["https://example.com/bad"],
        hosts: ["example.com"],
        httpStatuses: ["404"],
        canonicalWriteEligible: false
      },
      {
        leagueSlug: "gre.1",
        name: "Greek Super League",
        targetDate: "2026-05-22",
        priority: 35,
        action: "confirm_no_target_date_fixture_or_resolve_target_date_source",
        blockedReason: "all_fixture_candidates_outside_target_date",
        sourceUrls: ["https://example.org/fixtures"],
        hosts: ["example.org"],
        httpStatuses: ["200"],
        needsReviewFixtureIdentityCount: 8,
        outsideTargetDateCandidateCount: 8,
        canonicalWriteEligible: false
      }
    ]
  };
}

async function main() {
  const args = parseArgs();
  const input = args.selfTest ? selfTestInput() : readJson(args.input);
  const report = buildReport(input, {
    date: args.date,
    inputPath: args.selfTest ? "self-test" : args.input,
    priorityMax: args.priorityMax
  });
  writeJson(args.output, report, args.pretty);
  console.log(JSON.stringify({
    ok: report.ok,
    output: args.output,
    mode: report.mode,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
