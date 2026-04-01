# LEGACY FREEZE

## Frozen now
- old Cloudflare scheduler fixture ingest logic
- old API worker fixture runtime logic backed by KV staging/final
- Cloudflare-specific rotation / cooldown / anti-KV-spam fixture workarounds

## Rule
Do not extend legacy fixture flow anymore.
Only maintain it if absolutely needed until migration is complete.

## aimatchlab-scheduler

Status: FROZEN

Contains:
- old ingest cron logic
- KV staging/final system
- rotation / cooldown / rebuild hacks

Replaced by:
- engine-v1/jobs/ingest-day.js
- engine-v1/jobs/discover-active-leagues.js
- engine-v1/jobs/monitor-active-leagues.js

Rule:
Do not modify or extend this worker anymore.