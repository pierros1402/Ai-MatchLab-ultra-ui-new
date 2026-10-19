#!/usr/bin/env bash
set -euo pipefail
DAY_KEY="$1"
if ! git diff --cached --quiet; then echo 'Refusing unrelated staged changes' >&2; exit 2; fi
node engine-v1/jobs/repair-history-competition-foundations.js "$DAY_KEY" --apply
node engine-v1/jobs/preserve-history-checkpoint.js --stage=competition-provenance-foundations-repaired
git add -- data/history-index/ data/model-priors/ data/h2h/ data/h2h-foundation/ data/standings/
node engine-v1/jobs/guard-staged-data-boundary.js --label=competition-provenance-recovery --dayKey="$DAY_KEY" --allow-data-deletions \
 --allow='^(data/history-index/(team-form|league-form|matchups|foundation|competition-validation)/[^/]+\.json|data/model-priors/(foundation/)?[^/]+\.json|data/h2h/[^/]+\.json|data/h2h-foundation/current\.json|data/standings/[^/]+\.json)$'
if ! git diff --cached --quiet; then
 git config user.name 'github-actions[bot]'
 git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
 git commit -m "Rebuild competition-validated statistical inputs for ${DAY_KEY}"
 bash tools/git-push-rebase-retry.sh
fi
