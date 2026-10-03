import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTONOMOUS_REPAIR_PRODUCTION_ENVIRONMENT_VARIABLES
} from "./autonomous-repair-production-environment.js";

import {
  AUTONOMOUS_REPAIR_PRODUCTION_ROOT_POLICY_SCHEMA,
  resolveAutonomousRepairProductionRoots,
  resolveAutonomousRepairProductionTarget
} from "./autonomous-repair-production-root-policy.js";

const ENV =
  AUTONOMOUS_REPAIR_PRODUCTION_ENVIRONMENT_VARIABLES;

const ROOT_KEYS =
  Object.values(
    ENV
  );

function createHomeFixture() {
  const base =
    fs.mkdtempSync(
      path.join(
        os.homedir(),
        ".aiml-p2-root-policy-"
      )
    );

  const projectRoot =
    path.join(
      base,
      "project"
    );

  const externalStateRoot =
    path.join(
      base,
      "state"
    );

  const externalBackupRoot =
    path.join(
      base,
      "backup"
    );

  fs.mkdirSync(
    projectRoot
  );

  fs.mkdirSync(
    externalStateRoot
  );

  fs.mkdirSync(
    externalBackupRoot
  );

  return {
    base,
    projectRoot,
    externalStateRoot,
    externalBackupRoot
  };
}

function cleanupFixture(
  fixture
) {
  fs.rmSync(
    fixture.base,
    {
      recursive:
        true,
      force:
        true
    }
  );
}

function createTempDirectory(
  label
) {
  return fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      `.aiml-p2-${label}-`
    )
  );
}

function withRootEnvironment(
  roots,
  fn
) {
  const before =
    Object.fromEntries(
      ROOT_KEYS.map(
        key => [
          key,
          process.env[key]
        ]
      )
    );

  try {
    process.env[ENV.projectRoot] =
      roots.projectRoot;

    process.env[ENV.externalStateRoot] =
      roots.externalStateRoot;

    process.env[ENV.externalBackupRoot] =
      roots.externalBackupRoot;

    return fn();
  } finally {
    for (
      const key of ROOT_KEYS
    ) {
      if (
        before[key] ===
        undefined
      ) {
        delete process.env[key];
      } else {
        process.env[key] =
          before[key];
      }
    }
  }
}

function createDirectoryLink(
  target,
  linkPath
) {
  fs.symlinkSync(
    target,
    linkPath,
    process.platform ===
      "win32"
      ? "junction"
      : "dir"
  );
}

function negativeCase(
  number,
  title,
  body
) {
  test(
    `NEGATIVE_MATRIX_${String(number).padStart(2, "0")} ${title}`,
    body
  );
}

test(
  "valid production roots are canonical frozen durable roots outside OS temp",
  t => {
    const fixture =
      createHomeFixture();

    t.after(
      () =>
        cleanupFixture(
          fixture
        )
    );

    withRootEnvironment(
      fixture,
      () => {
        const roots =
          resolveAutonomousRepairProductionRoots();

        assert.equal(
          roots.schema,
          AUTONOMOUS_REPAIR_PRODUCTION_ROOT_POLICY_SCHEMA
        );

        assert.equal(
          roots.source,
          "trusted_process_environment"
        );

        assert.equal(
          roots.callerSuppliedRootsForbidden,
          true
        );

        assert.equal(
          roots.durableRootsRequired,
          true
        );

        assert.equal(
          Object.isFrozen(
            roots
          ),
          true
        );

        assert.equal(
          roots.projectRoot,
          fs.realpathSync(
            fixture.projectRoot
          )
        );
      }
    );
  }
);

test(
  "validated production roots resolve canonical project-contained target paths",
  t => {
    const fixture =
      createHomeFixture();

    fs.mkdirSync(
      path.join(
        fixture.projectRoot,
        "data",
        "final-results"
      ),
      {
        recursive:
          true
      }
    );

    t.after(
      () =>
        cleanupFixture(
          fixture
        )
    );

    withRootEnvironment(
      fixture,
      () => {
        const roots =
          resolveAutonomousRepairProductionRoots();

        const target =
          resolveAutonomousRepairProductionTarget(
            roots,
            "data/final-results/result.json"
          );

        assert.equal(
          target.relativePath,
          "data/final-results/result.json"
        );

        assert.equal(
          target.absolutePath,
          path.resolve(
            fixture.projectRoot,
            "data",
            "final-results",
            "result.json"
          )
        );

        assert.equal(
          Object.isFrozen(
            target
          ),
          true
        );
      }
    );
  }
);

negativeCase(
  1,
  "caller-supplied root object is forbidden",
  () => {
    assert.throws(
      () =>
        resolveAutonomousRepairProductionRoots({
          projectRoot:
            "caller"
        }),
      /caller_roots_forbidden/
    );
  }
);

negativeCase(
  2,
  "relative project root is forbidden",
  t => {
    const fixture =
      createHomeFixture();

    t.after(
      () =>
        cleanupFixture(
          fixture
        )
    );

    withRootEnvironment(
      {
        ...fixture,
        projectRoot:
          "relative-project"
      },
      () => {
        assert.throws(
          () =>
            resolveAutonomousRepairProductionRoots(),
          /project_root_absolute_required/
        );
      }
    );
  }
);

negativeCase(
  3,
  "relative state root is forbidden",
  t => {
    const fixture =
      createHomeFixture();

    t.after(
      () =>
        cleanupFixture(
          fixture
        )
    );

    withRootEnvironment(
      {
        ...fixture,
        externalStateRoot:
          "relative-state"
      },
      () => {
        assert.throws(
          () =>
            resolveAutonomousRepairProductionRoots(),
          /external_state_root_absolute_required/
        );
      }
    );
  }
);

negativeCase(
  4,
  "relative backup root is forbidden",
  t => {
    const fixture =
      createHomeFixture();

    t.after(
      () =>
        cleanupFixture(
          fixture
        )
    );

    withRootEnvironment(
      {
        ...fixture,
        externalBackupRoot:
          "relative-backup"
      },
      () => {
        assert.throws(
          () =>
            resolveAutonomousRepairProductionRoots(),
          /external_backup_root_absolute_required/
        );
      }
    );
  }
);

negativeCase(
  5,
  "missing project root is forbidden",
  t => {
    const fixture =
      createHomeFixture();

    t.after(
      () =>
        cleanupFixture(
          fixture
        )
    );

    withRootEnvironment(
      {
        ...fixture,
        projectRoot:
          path.join(
            fixture.base,
            "missing-project"
          )
      },
      () => {
        assert.throws(
          () =>
            resolveAutonomousRepairProductionRoots(),
          /project_root_missing/
        );
      }
    );
  }
);

negativeCase(
  6,
  "missing state root is forbidden",
  t => {
    const fixture =
      createHomeFixture();

    t.after(
      () =>
        cleanupFixture(
          fixture
        )
    );

    withRootEnvironment(
      {
        ...fixture,
        externalStateRoot:
          path.join(
            fixture.base,
            "missing-state"
          )
      },
      () => {
        assert.throws(
          () =>
            resolveAutonomousRepairProductionRoots(),
          /external_state_root_missing/
        );
      }
    );
  }
);

negativeCase(
  7,
  "missing backup root is forbidden",
  t => {
    const fixture =
      createHomeFixture();

    t.after(
      () =>
        cleanupFixture(
          fixture
        )
    );

    withRootEnvironment(
      {
        ...fixture,
        externalBackupRoot:
          path.join(
            fixture.base,
            "missing-backup"
          )
      },
      () => {
        assert.throws(
          () =>
            resolveAutonomousRepairProductionRoots(),
          /external_backup_root_missing/
        );
      }
    );
  }
);

negativeCase(
  8,
  "project root under OS temp is forbidden",
  t => {
    const fixture =
      createHomeFixture();

    const tempProject =
      createTempDirectory(
        "project"
      );

    t.after(
      () => {
        cleanupFixture(
          fixture
        );

        fs.rmSync(
          tempProject,
          {
            recursive:
              true,
            force:
              true
          }
        );
      }
    );

    withRootEnvironment(
      {
        ...fixture,
        projectRoot:
          tempProject
      },
      () => {
        assert.throws(
          () =>
            resolveAutonomousRepairProductionRoots(),
          /project_root_under_os_temp_forbidden/
        );
      }
    );
  }
);

negativeCase(
  9,
  "state root under OS temp is forbidden",
  t => {
    const fixture =
      createHomeFixture();

    const tempState =
      createTempDirectory(
        "state"
      );

    t.after(
      () => {
        cleanupFixture(
          fixture
        );

        fs.rmSync(
          tempState,
          {
            recursive:
              true,
            force:
              true
          }
        );
      }
    );

    withRootEnvironment(
      {
        ...fixture,
        externalStateRoot:
          tempState
      },
      () => {
        assert.throws(
          () =>
            resolveAutonomousRepairProductionRoots(),
          /external_state_root_under_os_temp_forbidden/
        );
      }
    );
  }
);

negativeCase(
  10,
  "backup root under OS temp is forbidden",
  t => {
    const fixture =
      createHomeFixture();

    const tempBackup =
      createTempDirectory(
        "backup"
      );

    t.after(
      () => {
        cleanupFixture(
          fixture
        );

        fs.rmSync(
          tempBackup,
          {
            recursive:
              true,
            force:
              true
          }
        );
      }
    );

    withRootEnvironment(
      {
        ...fixture,
        externalBackupRoot:
          tempBackup
      },
      () => {
        assert.throws(
          () =>
            resolveAutonomousRepairProductionRoots(),
          /external_backup_root_under_os_temp_forbidden/
        );
      }
    );
  }
);

negativeCase(
  11,
  "state root overlapping project root is forbidden",
  t => {
    const fixture =
      createHomeFixture();

    const stateInsideProject =
      path.join(
        fixture.projectRoot,
        "state"
      );

    fs.mkdirSync(
      stateInsideProject
    );

    t.after(
      () =>
        cleanupFixture(
          fixture
        )
    );

    withRootEnvironment(
      {
        ...fixture,
        externalStateRoot:
          stateInsideProject
      },
      () => {
        assert.throws(
          () =>
            resolveAutonomousRepairProductionRoots(),
          /project_state_overlap_forbidden/
        );
      }
    );
  }
);

negativeCase(
  12,
  "backup root overlapping project root is forbidden",
  t => {
    const fixture =
      createHomeFixture();

    const backupInsideProject =
      path.join(
        fixture.projectRoot,
        "backup"
      );

    fs.mkdirSync(
      backupInsideProject
    );

    t.after(
      () =>
        cleanupFixture(
          fixture
        )
    );

    withRootEnvironment(
      {
        ...fixture,
        externalBackupRoot:
          backupInsideProject
      },
      () => {
        assert.throws(
          () =>
            resolveAutonomousRepairProductionRoots(),
          /project_backup_overlap_forbidden/
        );
      }
    );
  }
);

negativeCase(
  13,
  "state and backup roots overlapping each other are forbidden",
  t => {
    const fixture =
      createHomeFixture();

    const backupInsideState =
      path.join(
        fixture.externalStateRoot,
        "backup"
      );

    fs.mkdirSync(
      backupInsideState
    );

    t.after(
      () =>
        cleanupFixture(
          fixture
        )
    );

    withRootEnvironment(
      {
        ...fixture,
        externalBackupRoot:
          backupInsideState
      },
      () => {
        assert.throws(
          () =>
            resolveAutonomousRepairProductionRoots(),
          /state_backup_overlap_forbidden/
        );
      }
    );
  }
);

negativeCase(
  14,
  "root reparse points plus target traversal and symlink escape fail closed",
  t => {
    const fixture =
      createHomeFixture();

    const projectLink =
      path.join(
        fixture.base,
        "project-link"
      );

    createDirectoryLink(
      fixture.projectRoot,
      projectLink
    );

    t.after(
      () =>
        cleanupFixture(
          fixture
        )
    );

    withRootEnvironment(
      {
        ...fixture,
        projectRoot:
          projectLink
      },
      () => {
        assert.throws(
          () =>
            resolveAutonomousRepairProductionRoots(),
          /project_root_real_directory_required|project_root_reparse_or_symlink_forbidden/
        );
      }
    );

    const outside =
      path.join(
        fixture.base,
        "outside"
      );

    fs.mkdirSync(
      outside
    );

    const escapeLink =
      path.join(
        fixture.projectRoot,
        "escape"
      );

    createDirectoryLink(
      outside,
      escapeLink
    );

    withRootEnvironment(
      fixture,
      () => {
        const roots =
          resolveAutonomousRepairProductionRoots();

        assert.throws(
          () =>
            resolveAutonomousRepairProductionTarget(
              roots,
              "../outside.txt"
            ),
          /target_path_not_canonical|target_outside_project/
        );

        assert.throws(
          () =>
            resolveAutonomousRepairProductionTarget(
              roots,
              "escape/outside.txt"
            ),
          /target_reparse_or_symlink_forbidden/
        );
      }
    );
  }
);
