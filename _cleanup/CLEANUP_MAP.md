# AIMATCHLAB ULTRA — CLEANUP MAP

## What goes inside `\\\_cleanup/`

Create / keep these files:

```text
\\\_cleanup/
  PHASE1\\\_STATUS.md
  CLEANUP\\\_MAP.md
  LEGACY\\\_FREEZE.md
  MIGRATION\\\_MAP.md
  DELETE\\\_LATER.md
```

## Recommended content

### `PHASE1\\\_STATUS.md`

* what was built in `engine-v1`
* what flow works now
* what remains single-source
* what comes next

### `CLEANUP\\\_MAP.md`

* high-level keep / freeze / reuse / delete-later plan

### `LEGACY\\\_FREEZE.md`

Mark these as legacy freeze:

* old Cloudflare scheduler fixture ingest logic
* old API worker fixture runtime logic that still reads KV staging/final keys
* Cloudflare KV anti-spam / rotation / fetch-limit workarounds

Rule:

> Do not extend legacy fixture flow anymore. Only maintain if needed until migration is complete.

### `MIGRATION\\\_MAP.md`

Map old -> new:

* old scheduler ingest -> `engine-v1/jobs/ingest-day.js`
* old discovery behavior -> `engine-v1/jobs/discover-active-leagues.js`
* old repeated polling -> `engine-v1/jobs/monitor-active-leagues.js`
* old day orchestration -> `engine-v1/jobs/run-daily-cycle.js`
* forward day fill -> `engine-v1/jobs/discover-window.js`

### `DELETE\\\_LATER.md`

Items not to delete yet, but candidate for later removal:

* duplicated config / registry copies once fully unified
* old Cloudflare-only fixture workarounds
* abandoned tests / temporary scripts
* stale backup folders if verified not needed
* unused collector stubs

## Current classification by area

### KEEP

* `engine-v1/`
* `workers/\\\_shared/leagues-registry.js`
* `workers/aimatchlab-ai-engine/`
* useful static data under `AI-MATCHLAB-DATA/`
* useful historical / baseline scripts under `harvesters/` if they still serve future enrichment / model work

### LEGACY FREEZE

* old scheduler worker fixture ingest logic
* old API worker fixture runtime backed by KV staging/final
* Cloudflare-specific rotation / cooldown / anti-KV-spam fixture flow

### REUSE LATER

* selected helpers from `\\\_shared/`
* odds modules if still valid after backbone migration
* historical stats / baseline assets

### DELETE LATER (ONLY AFTER VERIFICATION)

* duplicated configs
* dead experiments
* obsolete local `.wrangler` state
* stale `backups/`
* temp payload files

## Important rule

Do not delete old worker code until:

1. new engine covers fixture discovery
2. monitoring is stable
3. runtime consumers are mapped
4. old worker dependency chain is documented

