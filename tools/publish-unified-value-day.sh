#!/usr/bin/env bash
set -euo pipefail
DAY_KEY="$1"
node --input-type=module - "$DAY_KEY" <<'NODE'
import {athensDayKey,shiftDay} from './engine-v1/core/daykey.js';
const day=process.argv[2],today=athensDayKey();
if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||day<today||day>shiftDay(today,1)||day<'2026-10-18')throw Error('prospective_publication_day_required');
NODE
if ! git diff --cached --quiet; then
  echo "Refusing unrelated staged changes" >&2
  exit 2
fi
node engine-v1/jobs/build-unified-production-day.js "$DAY_KEY"
node engine-v1/jobs/build-value-plan-comparison-day.js --date="$DAY_KEY" --write
FINALIZATION_REPORT="$RUNNER_TEMP/prospective-release-finalization.json"
node tools/finalize-prospective-release.mjs "$DAY_KEY" "$FINALIZATION_REPORT"
SNAPSHOT_SYNC_REQUIRED="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).snapshotSyncRequired === true ? "true" : "false"' "$FINALIZATION_REPORT")"
for FILE in "data/value-unified/$DAY_KEY/public-plan.json" "data/value-data-readiness/$DAY_KEY.json" "data/value/_coverage-reports/$DAY_KEY.json" "data/value-comparison/$DAY_KEY.json"; do
  test -f "$FILE"
  git add -- "$FILE"
done
find "data/value-unified/$DAY_KEY/observations" -maxdepth 1 -type f -name '*.json' -exec git add -- {} +
if [ "$SNAPSHOT_SYNC_REQUIRED" = "true" ]; then
  git add -- "data/deploy-snapshots/latest.json" \
    "data/deploy-snapshots/$DAY_KEY/invariant-report.json" \
    "data/deploy-snapshots/$DAY_KEY/freshness-report.json" \
    "data/foundation-integrity/$DAY_KEY.json" "data/build-reports/$DAY_KEY.json"
fi
node engine-v1/jobs/guard-staged-data-boundary.js --label=prospective-value-publication --dayKey="$DAY_KEY" \
 --allow="^(data/value-unified/${DAY_KEY}/(observations/[a-f0-9]{64}\.json|public-plan\.json)|data/value-data-readiness/${DAY_KEY}\.json|data/value/_coverage-reports/${DAY_KEY}\.json|data/value-comparison/${DAY_KEY}\.json|data/deploy-snapshots/latest\.json|data/deploy-snapshots/${DAY_KEY}/(invariant-report|freshness-report)\.json|data/(foundation-integrity|build-reports)/${DAY_KEY}\.json)$"
if ! git diff --cached --quiet; then
  git config user.name "github-actions[bot]"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  git commit -m "Publish prospective unified Value observations for ${DAY_KEY}"
  bash tools/git-push-rebase-retry.sh
fi
PUBLISHED_REF="$(git rev-parse HEAD)"
if [ "$SNAPSHOT_SYNC_REQUIRED" = "true" ]; then
  bash tools/sync-public-snapshot.sh "$DAY_KEY" "$PUBLISHED_REF"
fi
node tools/sync-public-value-comparison.mjs "$DAY_KEY" "$PUBLISHED_REF"
