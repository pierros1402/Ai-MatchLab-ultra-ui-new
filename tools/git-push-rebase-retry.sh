#!/usr/bin/env bash
# Push local commits, surviving non-fast-forward races against other workflows.
#
# The frequent short jobs (odds-refresh, intraday refresh) routinely push while
# a long job (daily snapshot ~19min, autonomous run ~10min) is still building;
# a plain `git push` then loses the race and the whole build is discarded
# (this destroyed the 2026-07-01 evening pre-build and the 07-01 results).
#
# Strategy: on rejection, rebase our commits onto the new remote head and retry.
# -X theirs prefers OUR replayed commit on conflicting generated files — losing
# a 2-minute-old odds refresh is acceptable, losing a full daily build is not.
# autoStash tolerates the dirty working tree the build jobs leave behind.
set -uo pipefail

BRANCH="${GITHUB_REF_NAME:-main}"
ATTEMPTS="${PUSH_RETRY_ATTEMPTS:-5}"

for i in $(seq 1 "$ATTEMPTS"); do
  if git push origin "HEAD:${BRANCH}"; then
    exit 0
  fi
  echo "git push rejected (attempt ${i}/${ATTEMPTS}) — rebasing onto latest origin/${BRANCH}"
  if ! git -c rebase.autoStash=true pull --rebase -X theirs origin "$BRANCH"; then
    git rebase --abort || true
    echo "rebase failed; retrying after backoff"
  fi
  sleep $((5 * i))
done

echo "ERROR: git push still rejected after ${ATTEMPTS} attempts"
exit 1
