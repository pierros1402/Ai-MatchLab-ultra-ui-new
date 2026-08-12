import test from "node:test";
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
