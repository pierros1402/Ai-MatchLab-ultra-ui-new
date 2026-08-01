#!/usr/bin/env bash
set -euo pipefail

EXPECTED_SHA="${1:-}"
ENGINE_BASE="${ENGINE_BASE:-https://ai-matchlab-engine.onrender.com}"
MAX_ATTEMPTS="${RENDER_VERIFY_MAX_ATTEMPTS:-60}"
SLEEP_SECONDS="${RENDER_VERIFY_POLL_SECONDS:-10}"

if ! [[ "$EXPECTED_SHA" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "ERROR: expected 40-hex commit SHA" >&2
  exit 2
fi
ENGINE_BASE="${ENGINE_BASE%/}"

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  HEALTH_FILE="$(mktemp)"
  RELEASE_FILE="$(mktemp)"
  trap 'rm -f "$HEALTH_FILE" "$RELEASE_FILE"' RETURN

  HEALTH_CODE="$(curl -sS --connect-timeout 10 --max-time 30 -o "$HEALTH_FILE" -w '%{http_code}' "${ENGINE_BASE}/health" || true)"
  RELEASE_CODE="$(curl -sS --connect-timeout 10 --max-time 30 -o "$RELEASE_FILE" -w '%{http_code}' "${ENGINE_BASE}/release?verify=${EXPECTED_SHA}-${attempt}" || true)"
  RELEASE_SHA="$(node -e 'try{const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(p.gitCommit||""))}catch{}' "$RELEASE_FILE")"

  echo "ENGINE_RELEASE_ATTEMPT=${attempt} HEALTH_HTTP=${HEALTH_CODE} RELEASE_HTTP=${RELEASE_CODE} RELEASE_SHA=${RELEASE_SHA:-missing}"

  if [[ "$HEALTH_CODE" == "200" && "$RELEASE_CODE" == "200" && "$RELEASE_SHA" == "${EXPECTED_SHA,,}" ]]; then
    node -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(p.ok!==true)process.exit(1)' "$HEALTH_FILE"
    rm -f "$HEALTH_FILE" "$RELEASE_FILE"
    trap - RETURN
    echo "ENGINE_PUBLIC_RELEASE_VERIFIED=true"
    echo "ENGINE_PUBLIC_RELEASE_SHA=${EXPECTED_SHA,,}"
    exit 0
  fi

  rm -f "$HEALTH_FILE" "$RELEASE_FILE"
  trap - RETURN
  sleep "$SLEEP_SECONDS"
done

echo "ERROR: public engine did not converge to ${EXPECTED_SHA,,}" >&2
exit 1
