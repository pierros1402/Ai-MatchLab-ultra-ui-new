# PHASE 1 STATUS — ENGINE-V1

## DONE
- New local engine-v1 created
- Shared leagues registry connected from workers/_shared/leagues-registry.js
- Canonical fixture normalize v1
- JSON fixture store
- Observations log
- Skipped log
- Change-aware upsert
- Active leagues discovery
- Active leagues monitoring
- Daily cycle orchestrator
- Forward discovery window

## CURRENT SOURCE OF TRUTH
- engine-v1/ for new fixture backbone
- workers/_shared/leagues-registry.js for shared league registry

## LEGACY
- Old Cloudflare scheduler ingest remains legacy
- Old API worker fixture logic remains legacy until migration
- Old KV-centered fixture flow should not be extended further

## NEXT CHAPTER
- Project cleanup / separation
- Mark legacy files
- Remove duplicated config/helpers where safe
- Prepare migration map from old workers to engine-v1