import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTONOMOUS_REPAIR_PRODUCTION_ENVIRONMENT_SCHEMA,
  AUTONOMOUS_REPAIR_PRODUCTION_ENVIRONMENT_VARIABLES,
  readAutonomousRepairProductionEnvironment
} from "./autonomous-repair-production-environment.js";

const KEYS =
  Object.values(
    AUTONOMOUS_REPAIR_PRODUCTION_ENVIRONMENT_VARIABLES
  );

function withEnvironment(
  values,
  fn
) {
  const before =
    Object.fromEntries(
      KEYS.map(
        key => [
          key,
          process.env[key]
        ]
      )
    );

  try {
    for (
      const key of KEYS
    ) {
      delete process.env[key];
    }

    for (
      const [
        key,
        value
      ] of Object.entries(
        values
      )
    ) {
      if (
        value !==
        undefined
      ) {
        process.env[key] =
          value;
      }
    }

    return fn();
  } finally {
    for (
      const key of KEYS
    ) {
      const value =
        before[key];

      if (
        value ===
        undefined
      ) {
        delete process.env[key];
      } else {
        process.env[key] =
          value;
      }
    }
  }
}

test(
  "production environment rejects caller-supplied input",
  () => {
    assert.throws(
      () =>
        readAutonomousRepairProductionEnvironment({
          projectRoot:
            "caller"
        }),
      /autonomous_repair_production_environment_caller_input_forbidden/
    );
  }
);

test(
  "production environment requires all three trusted process root variables",
  () => {
    for (
      const missingKey of KEYS
    ) {
      const values =
        Object.fromEntries(
          KEYS.map(
            key => [
              key,
              key ===
                missingKey
                ? undefined
                : "/configured/root"
            ]
          )
        );

      withEnvironment(
        values,
        () => {
          assert.throws(
            () =>
              readAutonomousRepairProductionEnvironment(),
            /_missing/
          );
        }
      );
    }
  }
);

test(
  "production environment rejects blank trusted process root variables",
  () => {
    withEnvironment(
      {
        [AUTONOMOUS_REPAIR_PRODUCTION_ENVIRONMENT_VARIABLES.projectRoot]:
          " ",
        [AUTONOMOUS_REPAIR_PRODUCTION_ENVIRONMENT_VARIABLES.externalStateRoot]:
          "/state",
        [AUTONOMOUS_REPAIR_PRODUCTION_ENVIRONMENT_VARIABLES.externalBackupRoot]:
          "/backup"
      },
      () => {
        assert.throws(
          () =>
            readAutonomousRepairProductionEnvironment(),
          /project_root_missing/
        );
      }
    );
  }
);

test(
  "production environment returns a frozen process-level root contract without caller authority",
  () => {
    withEnvironment(
      {
        [AUTONOMOUS_REPAIR_PRODUCTION_ENVIRONMENT_VARIABLES.projectRoot]:
          "/project",
        [AUTONOMOUS_REPAIR_PRODUCTION_ENVIRONMENT_VARIABLES.externalStateRoot]:
          "/state",
        [AUTONOMOUS_REPAIR_PRODUCTION_ENVIRONMENT_VARIABLES.externalBackupRoot]:
          "/backup"
      },
      () => {
        const environment =
          readAutonomousRepairProductionEnvironment();

        assert.equal(
          environment.schema,
          AUTONOMOUS_REPAIR_PRODUCTION_ENVIRONMENT_SCHEMA
        );

        assert.equal(
          environment.source,
          "trusted_process_environment"
        );

        assert.equal(
          environment.callerSuppliedRootsForbidden,
          true
        );

        assert.equal(
          Object.isFrozen(
            environment
          ),
          true
        );

        assert.deepEqual(
          {
            projectRoot:
              environment.projectRoot,
            externalStateRoot:
              environment.externalStateRoot,
            externalBackupRoot:
              environment.externalBackupRoot
          },
          {
            projectRoot:
              "/project",
            externalStateRoot:
              "/state",
            externalBackupRoot:
              "/backup"
          }
        );
      }
    );
  }
);
