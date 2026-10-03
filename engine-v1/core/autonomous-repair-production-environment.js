export const AUTONOMOUS_REPAIR_PRODUCTION_ENVIRONMENT_SCHEMA =
  "ai-matchlab.autonomous-repair-production-environment.v1";

export const AUTONOMOUS_REPAIR_PRODUCTION_ENVIRONMENT_VERSION =
  "1.0.0";

export const AUTONOMOUS_REPAIR_PRODUCTION_ENVIRONMENT_VARIABLES =
  Object.freeze({
    projectRoot:
      "AIML_AUTONOMOUS_REPAIR_PROJECT_ROOT",

    externalStateRoot:
      "AIML_AUTONOMOUS_REPAIR_EXTERNAL_STATE_ROOT",

    externalBackupRoot:
      "AIML_AUTONOMOUS_REPAIR_EXTERNAL_BACKUP_ROOT"
  });

function requiredProcessEnvironmentValue(
  key,
  label
) {
  const value =
    String(
      process.env[key] ??
      ""
    ).trim();

  if (!value) {
    throw new Error(
      `autonomous_repair_production_environment_${label}_missing`
    );
  }

  return value;
}

export function readAutonomousRepairProductionEnvironment() {
  if (arguments.length !== 0) {
    throw new Error(
      "autonomous_repair_production_environment_caller_input_forbidden"
    );
  }

  const projectRoot =
    requiredProcessEnvironmentValue(
      AUTONOMOUS_REPAIR_PRODUCTION_ENVIRONMENT_VARIABLES.projectRoot,
      "project_root"
    );

  const externalStateRoot =
    requiredProcessEnvironmentValue(
      AUTONOMOUS_REPAIR_PRODUCTION_ENVIRONMENT_VARIABLES.externalStateRoot,
      "external_state_root"
    );

  const externalBackupRoot =
    requiredProcessEnvironmentValue(
      AUTONOMOUS_REPAIR_PRODUCTION_ENVIRONMENT_VARIABLES.externalBackupRoot,
      "external_backup_root"
    );

  return Object.freeze({
    schema:
      AUTONOMOUS_REPAIR_PRODUCTION_ENVIRONMENT_SCHEMA,

    version:
      AUTONOMOUS_REPAIR_PRODUCTION_ENVIRONMENT_VERSION,

    source:
      "trusted_process_environment",

    callerSuppliedRootsForbidden:
      true,

    projectRoot,

    externalStateRoot,

    externalBackupRoot
  });
}
