#!/usr/bin/env bash
# multi-odds-refresh-cron.sh — VM cron #2: per-bookmaker odds from OddsPapi.
#
# OddsPapi is unreachable from GitHub Actions (geo/403) but answers from this
# VM (verified 2026-07-14: 401 auth-required, not blocked), so the Greek /
# European / Asian / Betfair panel books can only be fetched here. Mirrors the
# structure of odds-refresh-cron.sh (cron #1): hourly slot, single-instance
# lock, Athens-hours gate, fresh checkout, guarded staging, rebase-retry push.
#
# The job merges into data/multi-odds/<day>.json (mergeWithDelta) so the
# odds-api.io books written by the Actions side are preserved, opening prices
# stay frozen, and deltas keep tracking.
#
# Requires ODDSPAPI_KEY in ~/.aimatchlab.env (chmod 600):
#   ODDSPAPI_KEY=...
# Without it the node job exits cleanly ("no ODDSPAPI_KEY — skip").
#
# Install (from the repo on the VM):
#   cp tools/vm/multi-odds-refresh-cron.sh ~/multi-odds-refresh-cron.sh
#   chmod +x ~/multi-odds-refresh-cron.sh
#   crontab: 40 * * * * /home/pierros/multi-odds-refresh-cron.sh >> /home/pierros/logs/multi-odds-refresh.log 2>&1
set -euo pipefail

cd "$HOME/matchlab"

# single-instance lock (distinct from cron #1's lock)
exec 9>/tmp/multi-odds-refresh.lock
flock -n 9 || exit 0

# Athens-hours guard (07:00-23:59), same as cron #1
HOUR=$(TZ=Europe/Athens date +%-H)
if [ "$HOUR" -lt 7 ]; then
  echo "$(date -u +%FT%TZ) outside Athens window; skip"
  exit 0
fi
DAY=$(TZ=Europe/Athens date +%F)

# secrets live outside the repo
if [ -f "$HOME/.aimatchlab.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$HOME/.aimatchlab.env"
  set +a
fi

# fresh-checkout parity: local data files must never win over origin
git fetch origin main -q
git reset --hard origin/main -q
git clean -fdq data/ || true

echo "$(date -u +%FT%TZ) run multi-odds (OddsPapi) refresh for $DAY"
node engine-v1/jobs/fetch-multi-bookmaker-odds.js "$DAY"

git add "data/multi-odds/$DAY.json" 2>/dev/null || true

node engine-v1/jobs/guard-staged-data-boundary.js \
  --label=multi-odds-refresh-vm \
  --dayKey="$DAY" \
  --allow="^data/multi-odds/$DAY\.json$"

if git diff --cached --quiet; then
  echo "$(date -u +%FT%TZ) no changes to commit"
else
  git commit -m "Refresh multi-bookmaker odds for $DAY"
  bash tools/git-push-rebase-retry.sh
fi
