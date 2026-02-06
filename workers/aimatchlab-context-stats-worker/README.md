Context Stats Aggregator – AIMATCHLAB

Reads:
- R2: aimatchlab-intel (intel/context/*)

Writes:
- KV: CONTEXT:STATS:DATE:<YYYY-MM-DD> (TTL 72h)

Endpoint:
GET /?date=YYYY-MM-DD

Deploy:
wrangler deploy
