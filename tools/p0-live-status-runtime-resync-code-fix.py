from pathlib import Path

source_path = Path('engine-v1/jobs/run-live-status-refresh-day.js')
test_path = Path('engine-v1/tests/live-status-completeness-integration.test.js')

source = source_path.read_text(encoding='utf-8')
import_anchor = 'import { resolveDataPath, ensureDir } from "../storage/data-root.js";\n'
import_replacement = import_anchor + 'import { syncCanonicalFixturesToJsonDbDay } from "./sync-canonical-fixtures-to-json-db-day.js";\n'
if source.count(import_anchor) != 1:
    raise SystemExit(f'import anchor count={source.count(import_anchor)}')
source = source.replace(import_anchor, import_replacement, 1)

end_anchor = '''  stats.finishedAt =\n    new Date().toISOString();\n\n  return finalizeLiveStatusRefreshStats(\n    stats\n  );\n}\n'''
end_replacement = '''  // Canonical status writes above are the authoritative truth. Keep the runtime\n  // fixture DB in the same state before any caller can rebuild details or a\n  // deploy snapshot; otherwise stale runtime status fields can be overlaid onto\n  // newer canonical non-played/final truth and create a false state conflict.\n  const canonicalRuntimeSync =\n    syncCanonicalFixturesToJsonDbDay(\n      safeDayKey,\n      { write: true }\n    );\n\n  if (canonicalRuntimeSync?.ok !== true) {\n    throw new Error(\n      "live_status_canonical_runtime_sync_failed"\n    );\n  }\n\n  stats.canonicalRuntimeSync = {\n    ok: true,\n    rawRows:\n      canonicalRuntimeSync.rawRows ?? 0,\n    acceptedRows:\n      canonicalRuntimeSync.acceptedRows ?? 0,\n    inserted:\n      canonicalRuntimeSync.inserted ?? 0,\n    updated:\n      canonicalRuntimeSync.updated ?? 0,\n    unchanged:\n      canonicalRuntimeSync.unchanged ?? 0\n  };\n\n  stats.finishedAt =\n    new Date().toISOString();\n\n  return finalizeLiveStatusRefreshStats(\n    stats\n  );\n}\n'''
if source.count(end_anchor) != 1:
    raise SystemExit(f'end anchor count={source.count(end_anchor)}')
source = source.replace(end_anchor, end_replacement, 1)
source_path.write_text(source, encoding='utf-8')

test = test_path.read_text(encoding='utf-8')
append = '''\n\ntest(\n  "live status refresh re-syncs runtime fixtures after canonical mutations",\n  () => {\n    const source = read(\n      "engine-v1/jobs/run-live-status-refresh-day.js"\n    );\n\n    assert.match(\n      source,\n      /syncCanonicalFixturesToJsonDbDay/u\n    );\n\n    const canonicalWriteIndex =\n      source.lastIndexOf(\n        "writeCanonicalLeague("\n      );\n\n    const runtimeSyncIndex =\n      source.lastIndexOf(\n        "syncCanonicalFixturesToJsonDbDay("\n      );\n\n    const finishedIndex =\n      source.indexOf(\n        "stats.finishedAt",\n        runtimeSyncIndex\n      );\n\n    const returnIndex =\n      source.indexOf(\n        "return finalizeLiveStatusRefreshStats",\n        runtimeSyncIndex\n      );\n\n    assert.ok(canonicalWriteIndex >= 0);\n    assert.ok(runtimeSyncIndex > canonicalWriteIndex);\n    assert.ok(finishedIndex > runtimeSyncIndex);\n    assert.ok(returnIndex > finishedIndex);\n\n    assert.match(\n      source,\n      /live_status_canonical_runtime_sync_failed/u\n    );\n  }\n);\n'''
if 'live status refresh re-syncs runtime fixtures after canonical mutations' in test:
    raise SystemExit('regression test already present')
test_path.write_text(test.rstrip() + append, encoding='utf-8')

print('Applied live-status canonical/runtime resync code fix')
