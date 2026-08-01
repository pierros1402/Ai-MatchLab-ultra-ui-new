#!/usr/bin/env bash
set -euo pipefail

DAY_KEY="${1:-}"
REF="${2:-}"
ENGINE_BASE="${ENGINE_BASE:-https://ai-matchlab-engine.onrender.com}"
CRON_SECRET="${CRON_SECRET:-}"
MAX_ATTEMPTS="${SNAPSHOT_SYNC_MAX_ATTEMPTS:-90}"
SLEEP_SECONDS="${SNAPSHOT_SYNC_POLL_SECONDS:-5}"

if ! [[ "$DAY_KEY" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "ERROR: invalid day key: $DAY_KEY" >&2
  exit 2
fi
if ! [[ "$REF" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "ERROR: immutable 40-hex Git ref required" >&2
  exit 2
fi
if [[ -z "$CRON_SECRET" ]]; then
  echo "ERROR: CRON_SECRET is required" >&2
  exit 2
fi

ENGINE_BASE="${ENGINE_BASE%/}"
START_RESPONSE="$(
  curl -fsS --connect-timeout 20 --max-time 45 \
    -X POST \
    -H "X-Cron-Secret: ${CRON_SECRET}" \
    "${ENGINE_BASE}/ops/sync-snapshot?date=${DAY_KEY}&ref=${REF}"
)"

JOB_ID="$(
  printf '%s' "$START_RESPONSE" |
    node -e '
      let raw="";
      process.stdin.on("data", chunk => raw += chunk);
      process.stdin.on("end", () => {
        const payload = JSON.parse(raw);
        const id = payload?.job?.id;
        if (!payload?.ok || !id) process.exit(2);
        process.stdout.write(String(id));
      });
    '
)"

echo "SNAPSHOT_SYNC_JOB_ID=${JOB_ID}"

FINAL_RESPONSE=""
for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  FINAL_RESPONSE="$(
    curl -fsS --connect-timeout 20 --max-time 45 \
      -H "X-Cron-Secret: ${CRON_SECRET}" \
      "${ENGINE_BASE}/ops/sync-snapshot/status?id=$(node -p 'encodeURIComponent(process.argv[1])' "$JOB_ID")"
  )"

  STATUS="$(
    printf '%s' "$FINAL_RESPONSE" |
      node -e '
        let raw="";
        process.stdin.on("data", chunk => raw += chunk);
        process.stdin.on("end", () => {
          const payload = JSON.parse(raw);
          process.stdout.write(String(payload?.job?.status || "unknown"));
        });
      '
  )"

  echo "SNAPSHOT_SYNC_ATTEMPT=${attempt} STATUS=${STATUS}"
  case "$STATUS" in
    succeeded) break ;;
    failed)
      printf '%s\n' "$FINAL_RESPONSE"
      exit 1
      ;;
  esac

  if [[ "$attempt" -eq "$MAX_ATTEMPTS" ]]; then
    echo "ERROR: snapshot sync did not finish in time" >&2
    printf '%s\n' "$FINAL_RESPONSE"
    exit 1
  fi
  sleep "$SLEEP_SECONDS"
done

RESULT_TSV="$(
  printf '%s' "$FINAL_RESPONSE" |
    node -e '
      let raw="";
      process.stdin.on("data", chunk => raw += chunk);
      process.stdin.on("end", () => {
        const payload = JSON.parse(raw);
        const job = payload?.job || {};
        const result = job.result || {};
        const fields = [
          job.status,
          result.ok === true ? "true" : "false",
          String(result.dayKey || ""),
          String(result.ref || ""),
          String(result.manifestHash || ""),
          result.latestPromoted === true ? "true" : "false"
        ];
        process.stdout.write(fields.join("\t"));
      });
    '
)"
IFS=$'\t' read -r JOB_STATUS RESULT_OK RESULT_DAY RESULT_REF MANIFEST_HASH LATEST_PROMOTED <<< "$RESULT_TSV"

if [[ "$JOB_STATUS" != "succeeded" || "$RESULT_OK" != "true" ]]; then
  echo "ERROR: sync child did not report success" >&2
  exit 1
fi
if [[ "$RESULT_DAY" != "$DAY_KEY" || "$RESULT_REF" != "${REF,,}" ]]; then
  echo "ERROR: sync result binding mismatch" >&2
  exit 1
fi
if ! [[ "$MANIFEST_HASH" =~ ^[0-9a-f]{64}$ ]]; then
  echo "ERROR: invalid synchronized manifest hash" >&2
  exit 1
fi

HEALTH="$(curl -fsS --connect-timeout 20 --max-time 45 "${ENGINE_BASE}/health")"
printf '%s' "$HEALTH" | node -e '
  let raw="";
  process.stdin.on("data", chunk => raw += chunk);
  process.stdin.on("end", () => { if (JSON.parse(raw)?.ok !== true) process.exit(1); });
'

SNAPSHOT="$(curl -fsS --connect-timeout 20 --max-time 45 "${ENGINE_BASE}/deploy-snapshot?date=${DAY_KEY}")"
printf '%s' "$SNAPSHOT" | node -e '
  let raw="";
  process.stdin.on("data", chunk => raw += chunk);
  process.stdin.on("end", () => {
    const payload = JSON.parse(raw);
    const expectedDay = process.argv[1];
    const expectedHash = process.argv[2];
    if (payload?.ok !== true || payload?.date !== expectedDay || payload?.manifest?.hash !== expectedHash) process.exit(1);
  });
' "$DAY_KEY" "$MANIFEST_HASH"

if [[ "$LATEST_PROMOTED" == "true" ]]; then
  LATEST="$(curl -fsS --connect-timeout 20 --max-time 45 "${ENGINE_BASE}/deploy-snapshot/latest")"
  printf '%s' "$LATEST" | node -e '
    let raw="";
    process.stdin.on("data", chunk => raw += chunk);
    process.stdin.on("end", () => {
      const payload = JSON.parse(raw);
      if (payload?.date !== process.argv[1] || payload?.hash !== process.argv[2]) process.exit(1);
    });
  ' "$DAY_KEY" "$MANIFEST_HASH"
fi

echo "SNAPSHOT_SYNC_VERIFIED=true"
echo "SNAPSHOT_SYNC_DAY=${DAY_KEY}"
echo "SNAPSHOT_SYNC_REF=${REF,,}"
echo "SNAPSHOT_SYNC_MANIFEST_HASH=${MANIFEST_HASH}"
echo "SNAPSHOT_SYNC_LATEST_PROMOTED=${LATEST_PROMOTED}"
