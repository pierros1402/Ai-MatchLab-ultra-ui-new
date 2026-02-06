Details Orchestrator – AIMATCHLAB

Role:
- Read facts + context + referee stats
- Assemble deterministic narrative for Details panel
- NO AI generation here

Reads:
- R2: stats/match/<matchId>/facts.json
- R2: intel/context/<matchId>/latest.json
- R2: stats/referee/<refId>.json

Endpoint:
GET /?matchId=<MATCH_ID>

Deploy:
wrangler deploy
