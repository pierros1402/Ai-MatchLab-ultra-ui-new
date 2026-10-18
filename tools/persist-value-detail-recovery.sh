#!/usr/bin/env bash
set -euo pipefail
DAY_KEY="$1"
node --input-type=module - "$DAY_KEY" <<'NODE'
import {athensDayKey,shiftDay} from './engine-v1/core/daykey.js';
const day=process.argv[2],today=athensDayKey();
if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||day<today||day>shiftDay(today,1))throw Error('prospective_recovery_day_required');
NODE
if ! git diff --cached --quiet; then echo "Refusing unrelated staged changes" >&2; exit 2; fi
if node engine-v1/jobs/audit-details-foundation-day.js "$DAY_KEY" > "$RUNNER_TEMP/value-detail-audit.json"; then
 echo "Derived inputs already verified; no repair needed."
 exit 0
fi
node engine-v1/jobs/recover-value-data-day.js "$DAY_KEY" --apply
node engine-v1/jobs/audit-details-foundation-day.js "$DAY_KEY"
node engine-v1/jobs/preserve-history-checkpoint.js --stage=autonomous-value-details-repaired
node engine-v1/jobs/build-foundation-integrity-report.js --date="$DAY_KEY" --no-latest
node engine-v1/jobs/build-day-report.js --date="$DAY_KEY"
git add -- "data/deploy-snapshots/$DAY_KEY/" "data/foundation-integrity/$DAY_KEY.json" "data/build-reports/$DAY_KEY.json"
node engine-v1/jobs/guard-staged-data-boundary.js --label=autonomous-value-detail-recovery --dayKey="$DAY_KEY" \
 --allow="^(data/deploy-snapshots/${DAY_KEY}/|data/foundation-integrity/${DAY_KEY}\.json$|data/build-reports/${DAY_KEY}\.json$)"
if ! git diff --cached --quiet; then
 git config user.name "github-actions[bot]"
 git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
 git commit -m "Repair verified derived Value inputs for ${DAY_KEY} without rewriting forecasts"
 bash tools/git-push-rebase-retry.sh
fi
