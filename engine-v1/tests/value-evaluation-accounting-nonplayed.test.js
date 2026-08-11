import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../core/build-value-day.js", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");

test("non-playable fixtures have one terminal rejection owner", () => {
  const preAuditStart = source.indexOf("for (const m of sourceMatches) {");
  const resourceLoad = source.indexOf(
    "const { indexes, priors } = await getSeasonResources",
    preAuditStart,
  );
  const evaluationStart = source.indexOf("for (const match of matches) {", resourceLoad);
  const evaluationEnd = source.indexOf("const dedupedPicks =", evaluationStart);

  assert.ok(preAuditStart >= 0);
  assert.ok(resourceLoad > preAuditStart);
  assert.ok(evaluationStart > resourceLoad);
  assert.ok(evaluationEnd > evaluationStart);

  const preAudit = source.slice(preAuditStart, resourceLoad);
  const evaluation = source.slice(evaluationStart, evaluationEnd);

  assert.match(
    preAudit,
    /if \(!isPlayable\(m\)\) \{ continue; \}/,
    "pre-audit must defer non-playable accounting to the evaluation loop",
  );
  assert.doesNotMatch(
    preAudit,
    /reason:\s*["']not_playable["']/,
    "pre-audit must not emit a second not_playable rejection",
  );
  assert.match(
    evaluation,
    /reason:\s*["']not_playable["']/,
    "evaluation loop must retain the single not_playable terminal rejection",
  );
});
