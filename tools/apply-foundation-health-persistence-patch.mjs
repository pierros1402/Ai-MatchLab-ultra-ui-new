import fs from "node:fs";

function normalizeLf(text) {
  return String(text || "").replace(/\r\n/gu, "\n");
}

function replaceCount(text, before, after, expected, label) {
  let count = 0;
  let cursor = 0;

  while (true) {
    const index = text.indexOf(before, cursor);
    if (index < 0) break;
    count += 1;
    cursor = index + before.length;
  }

  if (count !== expected) {
    throw new Error(`${label}: expected ${expected} anchor(s), found ${count}`);
  }

  return text.split(before).join(after);
}

const dailyPath = ".github/workflows/daily-deploy-snapshot.yml";
let daily = normalizeLf(fs.readFileSync(dailyPath, "utf8"));

const historyReportCode = [
  '          if compgen -G "data/history/????-????.report.json" > /dev/null; then',
  '            git add data/history/????-????.report.json',
  '          fi'
].join("\n");

const derivedPersistence = [
  historyReportCode,
  '',
  '          # Persist the exact derived foundations produced by run-daily-cycle.',
  '          # Their source history is committed in this same truth checkpoint,',
  '          # so the next runner validates the same state that passed publication.',
  '          if [ -d "data/history-index" ]; then',
  '            git add data/history-index',
  '          fi',
  '          if [ -d "data/h2h" ]; then',
  '            git add data/h2h',
  '          fi',
  '          if [ -f "data/h2h-foundation/current.json" ]; then',
  '            git add data/h2h-foundation/current.json',
  '          fi',
  '          if [ -d "data/model-priors" ]; then',
  '            git add data/model-priors',
  '          fi'
].join("\n");

daily = replaceCount(
  daily,
  historyReportCode,
  derivedPersistence,
  1,
  "daily derived foundation persistence"
);

const truthBoundaryBefore =
  'data/history/[0-9]{4}-[0-9]{4}(\\.report)?\\.json$|data/coverage-readiness/';
const truthBoundaryAfter =
  'data/history/[0-9]{4}-[0-9]{4}(\\.report)?\\.json$|data/history-index/|data/h2h/|data/h2h-foundation/|data/model-priors/|data/coverage-readiness/';

daily = replaceCount(
  daily,
  truthBoundaryBefore,
  truthBoundaryAfter,
  2,
  "daily truth boundary and diagnostic allow"
);

const snapshotStageAnchor = [
  '          if [ -f "data/build-reports/${DAY_KEY}.json" ]; then',
  '            git add "data/build-reports/${DAY_KEY}.json"',
  '          fi'
].join("\n");

const snapshotStageWithFoundation = [
  snapshotStageAnchor,
  '',
  '          if [ -f "data/foundation-integrity/${DAY_KEY}.json" ]; then',
  '            git add "data/foundation-integrity/${DAY_KEY}.json"',
  '          fi',
  '',
  '          if [ -f "data/foundation-integrity/latest.json" ]; then',
  '            git add "data/foundation-integrity/latest.json"',
  '          fi'
].join("\n");

daily = replaceCount(
  daily,
  snapshotStageAnchor,
  snapshotStageWithFoundation,
  1,
  "daily foundation artifact stage"
);

daily = replaceCount(
  daily,
  'data/build-reports/${DAY_KEY}\\.json$|data/system-health/',
  'data/build-reports/${DAY_KEY}\\.json$|data/foundation-integrity/${DAY_KEY}\\.json$|data/foundation-integrity/latest\\.json$|data/system-health/',
  1,
  "daily snapshot boundary allow"
);

daily = replaceCount(
  daily,
  'data/build-reports/|data/system-health/',
  'data/build-reports/|data/foundation-integrity/|data/system-health/',
  1,
  "daily snapshot diagnostic allow"
);

fs.writeFileSync(dailyPath, daily, "utf8");

const intradayPath = ".github/workflows/intraday-deploy-snapshot-refresh.yml";
let intraday = normalizeLf(fs.readFileSync(intradayPath, "utf8"));

intraday = replaceCount(
  intraday,
  '          test -e "data/build-reports/${DAY_KEY}.json" && git add "data/build-reports/${DAY_KEY}.json"\n',
  '',
  1,
  "remove early intraday build-report stage"
);

intraday = replaceCount(
  intraday,
  [
    '            git restore --staged -- "data/deploy-snapshots/${DAY_KEY}" "data/deploy-snapshots/latest.json" "data/build-reports/${DAY_KEY}.json" 2>/dev/null || true',
    '            git restore -- "data/deploy-snapshots/${DAY_KEY}" "data/deploy-snapshots/latest.json" "data/build-reports/${DAY_KEY}.json" 2>/dev/null || true'
  ].join("\n"),
  [
    '            git restore --staged -- "data/deploy-snapshots/${DAY_KEY}" "data/deploy-snapshots/latest.json" 2>/dev/null || true',
    '            git restore -- "data/deploy-snapshots/${DAY_KEY}" "data/deploy-snapshots/latest.json" 2>/dev/null || true'
  ].join("\n"),
  1,
  "remove early build-report restore"
);

intraday = replaceCount(
  intraday,
  '|data/build-reports/${DAY_KEY}\\\\.json$)',
  ')',
  1,
  "remove early build-report boundary"
);

const failureHealthBefore = [
  '          node ./engine-v1/jobs/build-system-health-alerts-day.js --date="$DAY_KEY" || true',
  '          git restore --staged . || true',
  '          test -f "data/system-health/${DAY_KEY}.json" && git add "data/system-health/${DAY_KEY}.json"',
  '          test -f "data/system-health/latest.json" && git add "data/system-health/latest.json"'
].join("\n");

const failureHealthAfter = [
  '          node ./engine-v1/jobs/build-foundation-integrity-report.js --date="$DAY_KEY" || true',
  '          node ./engine-v1/jobs/build-day-report.js --date="$DAY_KEY" || true',
  '          node ./engine-v1/jobs/build-system-health-alerts-day.js --date="$DAY_KEY" || true',
  '          git restore --staged . || true',
  '          test -f "data/foundation-integrity/${DAY_KEY}.json" && git add "data/foundation-integrity/${DAY_KEY}.json"',
  '          test -f "data/foundation-integrity/latest.json" && git add "data/foundation-integrity/latest.json"',
  '          test -f "data/build-reports/${DAY_KEY}.json" && git add "data/build-reports/${DAY_KEY}.json"',
  '          test -f "data/system-health/${DAY_KEY}.json" && git add "data/system-health/${DAY_KEY}.json"',
  '          test -f "data/system-health/latest.json" && git add "data/system-health/latest.json"'
].join("\n");

intraday = replaceCount(
  intraday,
  failureHealthBefore,
  failureHealthAfter,
  1,
  "coherent intraday failure health"
);

const configureAnchor = [
  '      - name: Configure git author',
  "        if: env.SKIP_BUILD != 'true'"
].join("\n");

const finalFoundationGate = [
  '      - name: Refresh and enforce intraday foundation health',
  "        if: env.SKIP_BUILD != 'true'",
  '        shell: bash',
  '        run: |',
  '          set -euo pipefail',
  '          node ./engine-v1/jobs/build-foundation-integrity-report.js --date="$DAY_KEY" --gate',
  '          node ./engine-v1/jobs/build-day-report.js --date="$DAY_KEY"',
  '',
  configureAnchor
].join("\n");

intraday = replaceCount(
  intraday,
  configureAnchor,
  finalFoundationGate,
  1,
  "intraday final foundation gate"
);

const finalBuildReportStage =
  '          if [ -f "data/build-reports/${DAY_KEY}.json" ]; then git add "data/build-reports/${DAY_KEY}.json"; fi';

const finalFoundationStage = [
  finalBuildReportStage,
  '          if [ -f "data/foundation-integrity/${DAY_KEY}.json" ]; then git add "data/foundation-integrity/${DAY_KEY}.json"; fi',
  '          if [ -f "data/foundation-integrity/latest.json" ]; then git add "data/foundation-integrity/latest.json"; fi'
].join("\n");

intraday = replaceCount(
  intraday,
  finalBuildReportStage,
  finalFoundationStage,
  1,
  "intraday final foundation stage"
);

intraday = replaceCount(
  intraday,
  'data/build-reports/${DAY_KEY}\\.json$|data/system-health/',
  'data/build-reports/${DAY_KEY}\\.json$|data/foundation-integrity/${DAY_KEY}\\.json$|data/foundation-integrity/latest\\.json$|data/system-health/',
  1,
  "intraday final boundary allow"
);

intraday = replaceCount(
  intraday,
  'data/build-reports/|data/system-health/',
  'data/build-reports/|data/foundation-integrity/|data/system-health/',
  1,
  "intraday final diagnostic allow"
);

fs.writeFileSync(intradayPath, intraday, "utf8");

console.log(JSON.stringify({
  ok: true,
  patched: [dailyPath, intradayPath]
}, null, 2));