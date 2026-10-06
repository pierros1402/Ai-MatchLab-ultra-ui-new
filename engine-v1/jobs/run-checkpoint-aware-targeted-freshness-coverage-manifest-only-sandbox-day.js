import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  buildCheckpointAwareFreshnessCoverageManifestOnlyUpdate
} from "../core/checkpoint-aware-targeted-freshness-coverage-manifest-only-adapter.js";

import {
  classifyCheckpointAwareFreshnessCoverageReadinessPlan
} from "../core/checkpoint-aware-targeted-freshness-coverage-readiness-plan.js";

export const CHECKPOINT_AWARE_FRESHNESS_COVERAGE_MANIFEST_ONLY_SANDBOX_SCHEMA =
  "ai-matchlab.checkpoint-aware-freshness-coverage-manifest-only-sandbox.v1";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

function readJson(
  file,
  code
) {
  try {
    return JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );
  }
  catch {
    throw new Error(
      code
    );
  }
}

function sha256File(
  file
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      fs.readFileSync(
        file
      )
    )
    .digest(
      "hex"
    );
}

function relativeInside(
  parent,
  child
) {
  const relative =
    path.relative(
      path.resolve(parent),
      path.resolve(child)
    );

  return (
    relative === "" ||
    (
      !relative.startsWith(
        `..${path.sep}`
      ) &&
      relative !==
        ".." &&
      !path.isAbsolute(
        relative
      )
    )
  );
}

function preservationSnapshot({
  inputRoot,
  dayKey
}) {
  const snapshotRoot =
    path.join(
      inputRoot,
      "data",
      "deploy-snapshots",
      dayKey
    );

  const rows = [];

  for (
    const name of [
      "value.json",
      "value-audit.json"
    ]
  ) {
    const file =
      path.join(
        snapshotRoot,
        name
      );

    rows.push({
      path:
        `data/deploy-snapshots/${dayKey}/${name}`,
      present:
        fs.existsSync(file),
      sha256:
        fs.existsSync(file)
          ? sha256File(file)
          : null
    });
  }

  const detailsDir =
    path.join(
      snapshotRoot,
      "details"
    );

  if (
    fs.existsSync(
      detailsDir
    )
  ) {
    for (
      const name of
      fs.readdirSync(
        detailsDir
      )
        .filter(
          value =>
            value.endsWith(
              ".json"
            )
        )
        .sort()
    ) {
      const file =
        path.join(
          detailsDir,
          name
        );

      rows.push({
        path:
          `data/deploy-snapshots/${dayKey}/details/${name}`,
        present:
          true,
        sha256:
          sha256File(
            file
          )
      });
    }
  }

  return rows;
}

export function runCheckpointAwareFreshnessCoverageManifestOnlySandboxDay({
  dayKey,
  inputRoot,
  sandboxRoot,
  generatedAt =
    new Date().toISOString()
} = {}) {
  const day =
    String(
      dayKey || ""
    ).trim();

  if (
    !DAY_RE.test(
      day
    )
  ) {
    throw new Error(
      "manifest_only_sandbox_day_invalid"
    );
  }

  const sourceRoot =
    path.resolve(
      String(
        inputRoot || ""
      )
    );

  if (
    !sourceRoot ||
    !fs.existsSync(
      sourceRoot
    )
  ) {
    throw new Error(
      "manifest_only_sandbox_input_root_missing"
    );
  }

  const outputRoot =
    path.resolve(
      String(
        sandboxRoot ||
        path.join(
          os.tmpdir(),
          `ai-matchlab-g5-manifest-only-${process.pid}-${Date.now()}`
        )
      )
    );

  if (
    relativeInside(
      sourceRoot,
      outputRoot
    )
  ) {
    throw new Error(
      "manifest_only_sandbox_root_must_be_outside_input_root"
    );
  }

  if (
    fs.existsSync(
      outputRoot
    )
  ) {
    throw new Error(
      "manifest_only_sandbox_root_preexisting"
    );
  }

  const manifestFile =
    path.join(
      sourceRoot,
      "data",
      "deploy-snapshots",
      day,
      "manifest.json"
    );

  const coverageFile =
    path.join(
      sourceRoot,
      "data",
      "coverage-readiness",
      `${day}.json`
    );

  const freshnessFile =
    path.join(
      sourceRoot,
      "data",
      "deploy-snapshots",
      day,
      "freshness-report.json"
    );

  const manifest =
    readJson(
      manifestFile,
      "manifest_only_sandbox_manifest_unreadable"
    );

  const coverageReadiness =
    readJson(
      coverageFile,
      "manifest_only_sandbox_coverage_unreadable"
    );

  const freshness =
    readJson(
      freshnessFile,
      "manifest_only_sandbox_freshness_unreadable"
    );

  const plan =
    classifyCheckpointAwareFreshnessCoverageReadinessPlan({
      dayKey:
        day,
      freshness
    });

  if (
    plan.planState !==
      "EXACT_COVERAGE_READINESS_REPAIR_PLAN"
  ) {
    throw new Error(
      `manifest_only_sandbox_plan_not_exact:${plan.planState}`
    );
  }

  const preservationBefore =
    preservationSnapshot({
      inputRoot:
        sourceRoot,
      dayKey:
        day
    });

  const adapterResult =
    buildCheckpointAwareFreshnessCoverageManifestOnlyUpdate({
      dayKey:
        day,
      manifest,
      coverageReadiness,
      generatedAt
    });

  const preservationAfter =
    preservationSnapshot({
      inputRoot:
        sourceRoot,
      dayKey:
        day
    });

  if (
    JSON.stringify(
      preservationAfter
    ) !==
    JSON.stringify(
      preservationBefore
    )
  ) {
    throw new Error(
      "manifest_only_sandbox_preservation_hash_changed"
    );
  }

  fs.mkdirSync(
    outputRoot,
    {
      recursive:
        false
    }
  );

  const outputManifestFile =
    path.join(
      outputRoot,
      "manifest.json"
    );

  fs.writeFileSync(
    outputManifestFile,
    JSON.stringify(
      adapterResult.manifest,
      null,
      2
    ) + "\n",
    "utf8"
  );

  const result = {
    ok:
      true,

    schema:
      CHECKPOINT_AWARE_FRESHNESS_COVERAGE_MANIFEST_ONLY_SANDBOX_SCHEMA,

    dayKey:
      day,

    mode:
      "SANDBOX_ONLY_NO_REPOSITORY_MUTATION",

    source: {
      inputRoot:
        sourceRoot,
      manifestFile,
      coverageFile,
      freshnessFile
    },

    plan: {
      planState:
        plan.planState,
      exactFailureClass:
        plan.exactFailureClass,
      exactRepairUnit:
        plan.exactRepairUnit,
      mutableBridgeStatus:
        plan.mutableBridgeStatus
    },

    adapter: {
      schema:
        adapterResult.schema,
      assignedMutationKeys:
        adapterResult.assignedMutationKeys,
      changedTopLevelKeys:
        adapterResult.changedTopLevelKeys,
      sourceGeneratedAt:
        adapterResult.source.generatedAt,
      targetGeneratedAt:
        adapterResult.target.generatedAt,
      sourceHash:
        adapterResult.source.hash,
      targetHash:
        adapterResult.target.hash
    },

    preservation: {
      before:
        preservationBefore,
      after:
        preservationAfter,
      byteIdentical:
        true
    },

    sandbox: {
      root:
        outputRoot,
      manifestFile:
        outputManifestFile
    },

    safety: {
      repositoryWritePerformed:
        false,
      sandboxWritePerformed:
        true,
      fullSnapshotExporterUsed:
        false,
      valueBytesPreserved:
        true,
      valueAuditBytesPreserved:
        true,
      allSnapshotDetailBytesPreserved:
        true
    }
  };

  fs.writeFileSync(
    path.join(
      outputRoot,
      "sandbox-result.json"
    ),
    JSON.stringify(
      result,
      null,
      2
    ) + "\n",
    "utf8"
  );

  return result;
}

function parseCli(
  argv
) {
  const out = {
    dayKey:
      null,
    inputRoot:
      null,
    sandboxRoot:
      null,
    generatedAt:
      null
  };

  for (
    const arg of argv
  ) {
    if (
      arg.startsWith(
        "--date="
      )
    ) {
      out.dayKey =
        arg.slice(
          "--date=".length
        );
    }
    else if (
      arg.startsWith(
        "--input-root="
      )
    ) {
      out.inputRoot =
        arg.slice(
          "--input-root=".length
        );
    }
    else if (
      arg.startsWith(
        "--sandbox-root="
      )
    ) {
      out.sandboxRoot =
        arg.slice(
          "--sandbox-root=".length
        );
    }
    else if (
      arg.startsWith(
        "--generated-at="
      )
    ) {
      out.generatedAt =
        arg.slice(
          "--generated-at=".length
        );
    }
    else {
      throw new Error(
        `manifest_only_sandbox_unknown_argument:${arg}`
      );
    }
  }

  return out;
}

const isCli =
  process.argv[1] &&
  fileURLToPath(
    import.meta.url
  ) ===
    path.resolve(
      process.argv[1]
    );

if (
  isCli
) {
  try {
    const args =
      parseCli(
        process.argv.slice(
          2
        )
      );

    const here =
      path.resolve(
        path.dirname(
          fileURLToPath(
            import.meta.url
          )
        ),
        "..",
        ".."
      );

    const result =
      runCheckpointAwareFreshnessCoverageManifestOnlySandboxDay({
        dayKey:
          args.dayKey,
        inputRoot:
          args.inputRoot ||
          here,
        sandboxRoot:
          args.sandboxRoot ||
          undefined,
        generatedAt:
          args.generatedAt ||
          undefined
      });

    console.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );
  }
  catch (error) {
    console.error(
      "[manifest-only-sandbox] fatal",
      error
    );

    process.exit(
      1
    );
  }
}