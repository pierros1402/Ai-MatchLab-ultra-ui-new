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

test("daily workflow deploys UI on operational-day rollover and verifies convergence", () => {
  const workflow = read(".github/workflows/daily-deploy-snapshot.yml");

  assert.match(workflow, /UI_OPERATIONAL_DAY_CHANGED=true/);
  assert.match(workflow, /Trigger required UI deploy on operational-day rollover/);
  assert.match(workflow, /RENDER_UI_DEPLOY_HOOK_URL is required when the public operational day changes/);
  assert.match(workflow, /Verify public UI operational-day convergence/);
  assert.match(workflow, /PUBLIC_UI_OPERATIONAL_DAY_CONVERGED=true/);
});

test("System Health surfaces engine/UI operational-day parity failures", () => {
  const source = read("assets/js/ui/system-health.js");

  assert.match(source, /public_ui_operational_day_mismatch/);
  assert.match(source, /active_panel_day_mismatch/);
  assert.match(source, /fetchStaticOperationalDay/);
  assert.match(source, /fetch\(engineUrl\("\/system-health"\)/);
  assert.match(source, /updateBadge\(usableArtifact, report\)/);
});
