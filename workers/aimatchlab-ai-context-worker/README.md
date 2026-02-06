AI Context Worker – AIMATCHLAB

Bindings:
- KV (read-only):
  - AIMATCHLAB_KV_CORE
  - AIMATCHLAB_STATS
- R2 (write):
  - aimatchlab-intel

Endpoints:
POST /context/:matchId
Query:
- force=true  -> regenerate even if latest exists

Deploy:
wrangler deploy
