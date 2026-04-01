# MIGRATION MAP

## Old -> New
- old scheduler ingest -> engine-v1/jobs/ingest-day.js
- old active discovery behavior -> engine-v1/jobs/discover-active-leagues.js
- old repeated polling -> engine-v1/jobs/monitor-active-leagues.js
- old daily orchestration -> engine-v1/jobs/run-daily-cycle.js
- forward day fill -> engine-v1/jobs/discover-window.js

## Pending migration targets
- old API /fixtures-runtime -> new engine-backed runtime
- old KV staging/final reads -> engine-v1 canonical store
- odds/value dependencies -> re-point after fixture migration
- AI/intel fixture dependency -> re-point after canonical fixture switch

## API WORKER MIGRATION

Current:
- aimatchlab-api/modules/liveEngine.js
- aimatchlab-api/modules/detailsEngine.js
- aimatchlab-api/modules/oddsEngine.js

Dependency:
- old KV fixture storage
- old scheduler ingest

Target:
- replace fixture reads with engine-v1 canonical store

Plan:
1. engine-v1 becomes source of truth for fixtures
2. API worker stops reading KV FIXTURES:DATE
3. API reads from engine-v1 (local or deployed)