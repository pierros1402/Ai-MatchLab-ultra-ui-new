from pathlib import Path

source_path = Path("engine-v1/jobs/run-daily-cycle.js")
source = source_path.read_text(encoding="utf-8").replace("\r\n", "\n")

state_anchor = "  let catchUpIndexesRebuild = [];\n  let h2hFoundationRebuild = null;\n"
state_replacement = "  let catchUpIndexesRebuild = [];\n  let historyCatchUp = [];\n  let h2hFoundationRebuild = null;\n"

if source.count(state_anchor) != 1:
    raise SystemExit(f"state anchor count != 1: {source.count(state_anchor)}")

scope_anchor = "    const historyCatchUp = [];\n    for (let back = 2; back <= 7; back++) {\n"
scope_replacement = "    historyCatchUp = [];\n    for (let back = 2; back <= 7; back++) {\n"

if source.count(scope_anchor) != 1:
    raise SystemExit(f"scope anchor count != 1: {source.count(scope_anchor)}")

source = source.replace(state_anchor, state_replacement, 1)
source = source.replace(scope_anchor, scope_replacement, 1)
source_path.write_text(source, encoding="utf-8", newline="\n")

test_path = Path("engine-v1/tests/daily-history-catchup-h2h-scope.test.js")
test_path.write_text(
    '''import test from "node:test";\nimport assert from "node:assert/strict";\nimport fs from "node:fs";\n\nconst source = fs\n  .readFileSync(\n    new URL("../jobs/run-daily-cycle.js", import.meta.url),\n    "utf8"\n  )\n  .replace(/\\r\\n/g, "\\n");\n\ntest("history catch-up state stays in runDailyCycle scope through H2H refresh", () => {\n  const declarationIndex = source.indexOf(\n    "  let historyCatchUp = [];"\n  );\n  const finalizeMarkerIndex = source.indexOf(\n    'console.log("[daily-cycle] finalize-live-status-refresh:start"'\n  );\n  const resetIndex = source.indexOf(\n    "    historyCatchUp = [];",\n    finalizeMarkerIndex\n  );\n  const h2hIndex = source.indexOf(\n    "historyCatchUp.some(row => row?.appended === true)"\n  );\n\n  assert.ok(declarationIndex >= 0, "run-scope historyCatchUp state is missing");\n  assert.ok(finalizeMarkerIndex > declarationIndex, "historyCatchUp must be declared before finalization");\n  assert.ok(resetIndex > finalizeMarkerIndex, "historyCatchUp must be reset inside finalization without redeclaration");\n  assert.ok(h2hIndex > resetIndex, "H2H refresh must consume the same run-scope historyCatchUp state");\n  assert.doesNotMatch(source, /\\bconst historyCatchUp = \\[\\];/u);\n});\n''',
    encoding="utf-8",
    newline="\n",
)

print("Applied daily history catch-up scope fix and regression test")
