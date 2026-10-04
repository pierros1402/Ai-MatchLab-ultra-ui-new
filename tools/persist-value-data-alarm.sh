#!/usr/bin/env bash
set -euo pipefail
DAY_KEY="$1"
node -e 'if(!/^\d{4}-\d{2}-\d{2}$/.test(process.argv[1])) process.exit(2)' "$DAY_KEY"
if ! git diff --cached --quiet; then
  echo "ERROR: data alarm will not commit unrelated staged changes" >&2
  exit 2
fi
EXTRA_ARGS=()
if [ "${VALUE_APPLY_VERIFIED_CONTRACTS:-false}" = "true" ]; then EXTRA_ARGS+=(--apply-verified-contracts); fi
node engine-v1/jobs/run-value-data-alarm-day.js "$DAY_KEY" --write --research --max-research-leagues "${VALUE_MAX_RESEARCH_LEAGUES:-2}" "${EXTRA_ARGS[@]}"
git add "data/value-data-acquisition/queue.json" "data/value-data-acquisition/${DAY_KEY}.json"
if [ -d "data/value-data-acquisition/${DAY_KEY}" ]; then git add "data/value-data-acquisition/${DAY_KEY}/"; fi
export DAY_KEY
node --input-type=module <<'NODE'
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { currentSeason, seasonBefore } from './engine-v1/core/season.js';
const day = process.env.DAY_KEY;
const report = JSON.parse(fs.readFileSync(`data/value-data-acquisition/${day}.json`, 'utf8'));
for (const file of report.competitionContractPreparation?.writePaths || []) {
  if (!/^(data\/competition-format-registry\/registry\.v1\.json|data\/standings\/[a-zA-Z0-9_.-]+\.json)$/.test(file)) throw new Error('official_contract_write_scope_invalid');
  execFileSync('git', ['add', file], { stdio: 'inherit' });
}
if (report.historicalFormPreparation?.changed) {
  const season = report.historicalFormPreparation.season;
  if (season !== seasonBefore(currentSeason())) throw new Error('invalid_historical_form_season');
  for (const kind of ['team-form','league-form','matchups','foundation']) {
    execFileSync('git', ['add', `data/history-index/${kind}/${season}.json`], { stdio: 'inherit' });
  }
}
for (const target of report.oddsWrittenDays) {
  const offset = (Date.parse(`${target}T12:00Z`) - Date.parse(`${day}T12:00Z`)) / 86400000;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target) || offset < 0 || offset > 7 || !Number.isInteger(offset)) throw new Error('alarm_write_outside_lookahead');
  execFileSync('git', ['add', `data/deploy-snapshots/${target}/odds.json`], { stdio: 'inherit' });
}
NODE
EXTRA_DAYS="$(node -e 'const fs=require("fs"); const r=JSON.parse(fs.readFileSync(`data/value-data-acquisition/${process.env.DAY_KEY}.json`)); console.log(r.oddsWrittenDays.join(","))')"
node engine-v1/jobs/guard-staged-data-boundary.js --label=value-data-alarm --dayKey="$DAY_KEY" \
  --extra-days="$EXTRA_DAYS" \
  --allow="^(data/value-data-acquisition/(queue\.json|${DAY_KEY}\.json|${DAY_KEY}/[^/]+\.research\.json)$|data/deploy-snapshots/[0-9]{4}-[0-9]{2}-[0-9]{2}/odds\.json$|data/history-index/(team-form|league-form|matchups|foundation)/[0-9]{4}-[0-9]{4}\.json$|data/competition-format-registry/registry\.v1\.json$|data/standings/[a-zA-Z0-9_.-]+\.json$)"
if ! git diff --cached --quiet; then
  git config user.name "github-actions[bot]"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  git commit -m "Persist pre-match Value data alarms and verified inputs for ${DAY_KEY}"
  bash tools/git-push-rebase-retry.sh
fi
node -e 'const fs=require("fs"); const r=JSON.parse(fs.readFileSync(`data/value-data-acquisition/${process.env.DAY_KEY}.json`)); if(r.acquisitionErrors?.length) { console.error("Persisted assessment-production failures:",r.acquisitionErrors); process.exit(1); }'
