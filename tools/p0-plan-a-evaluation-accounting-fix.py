from pathlib import Path

source_path = Path("engine-v1/core/build-value-day.js")
source = source_path.read_text(encoding="utf-8")

old = '''      if (!isPlayable(match)) {
        auditRejections.push({
          matchId:
            evaluatedFixtureId,
          reason:
            "not_playable"
        });

        continue;
      }
'''

new = '''      if (!isPlayable(match)) {
        // The pre-audit pass already owns the single terminal rejection for
        // non-playable fixtures. Do not emit the same outcome twice here: the
        // evaluation-accounting invariant requires exactly one terminal
        // outcome per canonical fixture.
        continue;
      }
'''

count = source.count(old)
if count != 1:
    raise SystemExit(f"Plan A not_playable accounting anchor mismatch: expected 1, found {count}")

source_path.write_text(source.replace(old, new, 1), encoding="utf-8", newline="\n")

Path("engine-v1/tests/plan-a-evaluation-accounting-exclusivity.test.js").write_text(r'''import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Plan A records non-playable rejection exactly once before evaluation", () => {
  const source = fs.readFileSync(
    new URL("../core/build-value-day.js", import.meta.url),
    "utf8"
  ).replace(/\r\n/g, "\n");

  const auditStart = source.indexOf("  const auditRejections = [];");
  const resourceStart = source.indexOf(
    "  const { indexes, priors } = await getSeasonResources",
    auditStart
  );
  const evaluationStart = source.indexOf("  for (const match of matches) {", resourceStart);
  const detailsStart = source.indexOf(
    "      const details = readDetailsSnapshot",
    evaluationStart
  );

  assert.ok(auditStart >= 0);
  assert.ok(resourceStart > auditStart);
  assert.ok(evaluationStart > resourceStart);
  assert.ok(detailsStart > evaluationStart);

  const preAudit = source.slice(auditStart, resourceStart);
  const evaluationPrelude = source.slice(evaluationStart, detailsStart);

  assert.match(
    preAudit,
    /if \(!isPlayable\(m\)\) \{ auditRejections\.push\(\{ matchId: auditIdOf\(m\), reason: "not_playable" \}\); continue; \}/
  );

  assert.match(
    evaluationPrelude,
    /if \(!isPlayable\(match\)\) \{[\s\S]*?continue;\n      \}/
  );

  assert.doesNotMatch(
    evaluationPrelude,
    /reason:\s*\n?\s*"not_playable"/
  );
});
''', encoding="utf-8", newline="\n")
