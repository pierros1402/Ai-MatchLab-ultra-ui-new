import fs from "node:fs";

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  const last = text.lastIndexOf(before);
  if (first < 0 || first !== last) {
    throw new Error(`${label}: expected exactly one anchor`);
  }
  return text.slice(0, first) + after + text.slice(first + before.length);
}

function transformLineOnce(text, predicate, transform, label) {
  const lines = text.split("\n");
  const indexes = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (predicate(lines[i])) indexes.push(i);
  }
  if (indexes.length !== 1) {
    throw new Error(`${label}: expected one line, found ${indexes.length}`);
  }
  const index = indexes[0];
  const next = transform(lines[index]);
  if (next === lines[index]) {
    throw new Error(`${label}: transform made no change`);
  }
  lines[index] = next;
  return lines.join("\n");
}

const dailyPath = ".github/workflows/daily-deploy-snapshot.yml";
let daily = fs.readFileSync(dailyPath, "utf8");

const historyReportCode = `          if compgen -G "data/history/????-????.report.json" > /dev/null; then
            git add data/history/????-????.report.json
          fi
`;

const derivedPersistence = `${historyReportCode}
          # Persist the exact derived model foundations produced by run-daily-cycle
          # together with their already-staged source history. Otherwise the next
          # runner starts from stale committed indexes/priors/H2H even though this
          # runner passed the foundation gate with fresh derived outputs.
          if [ -d "data/history-index" ]; then
            git add data/history-index
          fi
          if [ -d "data/h2h" ]; then
            git add data/h2h
          fi
          if [ -f "data/h2h-foundation/current.json" ]; then
            git add data/h2h-foundation/current.json
          fi
          if [ -d "data/model-priors" ]; then
            git add data/model-priors
          fi
`;

daily = replaceOnce(
  daily,
  historyReportCode,
  derivedPersistence,
  "daily derived foundation persistence"
);

daily = transformLineOnce(
  daily,
  line => line.includes("--label=daily-deploy-truth") && line.includes("--allow="),
  line => line.replace(
    "|data/coverage-readiness/",
    "|data/history-index/|data/h2h/|data/h2h-foundation/current\\.json$|data/model-priors/|data/coverage-readiness/"
  ),
  "daily truth boundary allow"
);

daily = transformLineOnce(
  daily,
  line => line.includes("DISALLOWED=") && line.includes("data/history/") && line.includes("data/coverage-readiness/"),
  line => line.replace(
    "|data/coverage-readiness/",
    "|data/history-index/|data/h2h/|data/h2h-foundation/|data/model-priors/|data/coverage-readiness/"
  ),
  "daily truth diagnostic allow"
);

const buildReportStage = `          if [ -f "data/build-reports/${DAY_KEY}.json" ]; then
            git add "data/build-reports/${DAY_KEY}.json"
          fi
`;

const foundationStage = `${buildReportStage}
          if [ -f "data/foundation-integrity/${DAY_KEY}.json" ]; then
            git add "data/foundation-integrity/${DAY_KEY}.json"
          fi

          if [ -f "data/foundation-integrity/latest.json" ]; then
            git add "data/foundation-integrity/latest.json"
          fi
`;

daily = replaceOnce(
  daily,
  buildReportStage,
  foundationStage,
  "daily foundation artifact stage"
);

daily = transformLineOnce(
  daily,
  line => line.includes("--label=daily-deploy-snapshot") && line.includes("data/build-reports/${DAY_KEY}"),
  line => line.replace(
    "|data/system-health/${DAY_KEY}",
    "|data/foundation-integrity/${DAY_KEY}\\.json$|data/foundation-integrity/latest\\.json$|data/system-health/${DAY_KEY}"
  ),
  "daily snapshot boundary allow"
);

daily = transformLineOnce(
  daily,
  line => line.includes("DISALLOWED=") && line.includes("data/build-reports/") && line.includes("data/system-health/"),
  line => line.replace(
    "|data/system-health/",
    "|data/foundation-integrity/|data/system-health/"
  ),
  "daily snapshot diagnostic allow"
);

fs.writeFileSync(dailyPath, daily, "utf8");

const intradayPath = ".github/workflows/intraday-deploy-snapshot-refresh.yml";
let intraday = fs.readFileSync(intradayPath, "utf8");

intraday = replaceOnce(
  intraday,
  `          test -e "data/build-reports/${DAY_KEY}.json" && git add "data/build-reports/${DAY_KEY}.json"\n`,
  ``,
  "remove early intraday build-report stage"
);

intraday = replaceOnce(
  intraday,
  `            git restore --staged -- "data/deploy-snapshots/${DAY_KEY}" "data/deploy-snapshots/latest.json" "data/build-reports/${DAY_KEY}.json" 2>/dev/null || true\n            git restore -- "data/deploy-snapshots/${DAY_KEY}" "data/deploy-snapshots/latest.json" "data/build-reports/${DAY_KEY}.json" 2>/dev/null || true`,
  `            git restore --staged -- "data/deploy-snapshots/${DAY_KEY}" "data/deploy-snapshots/latest.json" 2>/dev/null || true\n            git restore -- "data/deploy-snapshots/${DAY_KEY}" "data/deploy-snapshots/latest.json" 2>/dev/null || true`,
  "remove early build-report restore"
);

intraday = transformLineOnce(
  intraday,
  line => line.includes("--label=intraday-public-truth-checkpoint") && line.includes("data/build-reports/${DAY_KEY}"),
  line => line.replace(
    "|data/build-reports/${DAY_KEY}\\\\.json$",
    ""
  ),
  "remove early build-report boundary"
);

const failureHealth = `          node ./engine-v1/jobs/build-system-health-alerts-day.js --date="$DAY_KEY" || true
          git restore --staged . || true
          test -f "data/system-health/${DAY_KEY}.json" && git add "data/system-health/${DAY_KEY}.json"
          test -f "data/system-health/latest.json" && git add "data/system-health/latest.json"`;

const coherentFailureHealth = `          node ./engine-v1/jobs/build-foundation-integrity-report.js --date="$DAY_KEY" || true
          node ./engine-v1/jobs/build-day-report.js --date="$DAY_KEY" || true
          node ./engine-v1/jobs/build-system-health-alerts-day.js --date="$DAY_KEY" || true
          git restore --staged . || true
          test -f "data/foundation-integrity/${DAY_KEY}.json" && git add "data/foundation-integrity/${DAY_KEY}.json"
          test -f "data/foundation-integrity/latest.json" && git add "data/foundation-integrity/latest.json"
          test -f "data/build-reports/${DAY_KEY}.json" && git add "data/build-reports/${DAY_KEY}.json"
          test -f "data/system-health/${DAY_KEY}.json" && git add "data/system-health/${DAY_KEY}.json"
          test -f "data/system-health/latest.json" && git add "data/system-health/latest.json"`;

intraday = replaceOnce(
  intraday,
  failureHealth,
  coherentFailureHealth,
  "coherent intraday failure health"
);

const configureAnchor = `      - name: Configure git author
        if: env.SKIP_BUILD != 'true'`;

const finalFoundationGate = `      # Health must describe the same persisted foundation state as the snapshot.
      # Intraday may refresh Details/status, but it must never mutate model
      # foundations merely to silence diagnostics. Stale model foundations fail.
      - name: Refresh and enforce intraday foundation health
        if: env.SKIP_BUILD != 'true'
        shell: bash
        run: |
          set -euo pipefail
          node ./engine-v1/jobs/build-foundation-integrity-report.js --date="$DAY_KEY" --gate
          node ./engine-v1/jobs/build-day-report.js --date="$DAY_KEY"

${configureAnchor}`;

intraday = replaceOnce(
  intraday,
  configureAnchor,
  finalFoundationGate,
  "intraday final foundation gate"
);

const finalBuildReportStage = `          if [ -f "data/build-reports/${DAY_KEY}.json" ]; then git add "data/build-reports/${DAY_KEY}.json"; fi`;
const finalFoundationStage = `${finalBuildReportStage}
          if [ -f "data/foundation-integrity/${DAY_KEY}.json" ]; then git add "data/foundation-integrity/${DAY_KEY}.json"; fi
          if [ -f "data/foundation-integrity/latest.json" ]; then git add "data/foundation-integrity/latest.json"; fi`;

intraday = replaceOnce(
  intraday,
  finalBuildReportStage,
  finalFoundationStage,
  "intraday final foundation stage"
);

intraday = transformLineOnce(
  intraday,
  line => line.includes("--label=intraday-deploy-snapshot-refresh") && line.includes("data/build-reports/${DAY_KEY}"),
  line => line.replace(
    "|data/system-health/${DAY_KEY}",
    "|data/foundation-integrity/${DAY_KEY}\\.json$|data/foundation-integrity/latest\\.json$|data/system-health/${DAY_KEY}"
  ),
  "intraday final boundary allow"
);

intraday = transformLineOnce(
  intraday,
  line => line.includes("BAD=") && line.includes("data/build-reports/") && line.includes("data/system-health/"),
  line => line.replace(
    "|data/system-health/",
    "|data/foundation-integrity/|data/system-health/"
  ),
  "intraday final diagnostic allow"
);

fs.writeFileSync(intradayPath, intraday, "utf8");

console.log(JSON.stringify({
  ok: true,
  patched: [dailyPath, intradayPath]
}, null, 2));
