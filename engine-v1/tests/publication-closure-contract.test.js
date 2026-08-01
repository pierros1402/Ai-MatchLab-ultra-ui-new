import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { reconcileSkippedSlugSample } from "../system-health/final-skipped-slugs.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("post-retry skipped diagnostics remove admitted slugs only", () => {
  const result = reconcileSkippedSlugSample(
    {
      "caf.w.nations": 4,
      "par.1": 2,
      "slv.1": 2,
      "hon.1": 1
    },
    {
      admittedSlugs: ["par.1"],
      decisions: [
        { slug: "slv.1", classification: "admitted" },
        { slug: "hon.1", classification: "pending" }
      ]
    }
  );

  assert.deepEqual(result, {
    "caf.w.nations": 4,
    "hon.1": 1
  });
});

test("push retry protects untracked generated files before rebase", () => {
  const script = read("tools/git-push-rebase-retry.sh");

  assert.match(script, /git ls-files --others --exclude-standard -z/);
  assert.match(script, /Remove only paths proven untracked by git/);
  assert.match(script, /UNTRACKED_RESTORE_CONFLICT=/);
  assert.match(script, /rebase\.autoStash=true/);
  assert.doesNotMatch(script, /git clean -fd\s*$/m);
});

test("daily and intraday publication are authenticated commit-pinned and fail closed", () => {
  const daily = read(".github/workflows/daily-deploy-snapshot.yml");
  const intraday = read(".github/workflows/intraday-deploy-snapshot-refresh.yml");
  const helper = read("tools/sync-public-snapshot.sh");

  for (const workflow of [daily, intraday]) {
    assert.match(workflow, /PUBLISHED_REF="\$\(git rev-parse HEAD\)"/);
    assert.match(workflow, /CRON_SECRET: \$\{\{ secrets\.CRON_SECRET \}\}/);
    assert.match(workflow, /tools\/sync-public-snapshot\.sh/);
    assert.doesNotMatch(workflow, /sync request failed \(non-fatal\)/);
    assert.doesNotMatch(workflow, /\/ops\/sync-snapshot\?date=/);
  }

  assert.match(helper, /-X POST/);
  assert.match(helper, /X-Cron-Secret/);
  assert.match(helper, /ref=\$\{REF\}/);
  assert.match(helper, /SNAPSHOT_SYNC_VERIFIED=true/);
});

test("data-only publication never redeploys the static UI for a day rollover", () => {
  const workflow = read(".github/workflows/daily-deploy-snapshot.yml");

  assert.match(workflow, /Data publication requires no UI deploy/);
  assert.doesNotMatch(workflow, /UI_OPERATIONAL_DAY_CHANGED/);
  assert.doesNotMatch(workflow, /PUBLIC_POINTER_URL/);
  assert.doesNotMatch(workflow, /Trigger required UI deploy on operational-day rollover/);
});

test("System Health uses engine readiness rather than a static UI data pointer", () => {
  const source = read("assets/js/ui/system-health.js");

  assert.match(source, /engine_operational_day_mismatch/);
  assert.match(source, /operational_snapshot_unavailable/);
  assert.match(source, /AIML_OperationalDay/);
  assert.match(source, /\/system-health-alerts/);
  assert.doesNotMatch(source, /data\/deploy-snapshots\/latest\.json/);
  assert.doesNotMatch(source, /fetchStaticOperationalDay/);
});
