import {
  AUTONOMOUS_REPAIR_PRODUCTION_EXECUTION_STATE,
  inspectAutonomousRepairProductionExecutionReadiness
} from "./autonomous-repair-production-execution-entrypoint.js";

export const AUTONOMOUS_REPAIR_SYSTEM_HEALTH_SCHEMA =
  "ai-matchlab.autonomous-repair-system-health.v1";

export const AUTONOMOUS_REPAIR_SYSTEM_HEALTH_VERSION =
  "1.0.0";

export const AUTONOMOUS_REPAIR_SYSTEM_HEALTH_MODE =
  Object.freeze({
    OBSERVABILITY_ONLY:
      "OBSERVABILITY_ONLY"
  });

export const AUTONOMOUS_REPAIR_SYSTEM_HEALTH_STATUS =
  Object.freeze({
    EXPECTED_FAIL_CLOSED:
      "EXPECTED_FAIL_CLOSED"
  });

export const AUTONOMOUS_REPAIR_SYSTEM_HEALTH_CODE =
  Object.freeze({
    NO_PINNED_TRUST:
      "AUTONOMOUS_REPAIR_NO_PINNED_TRUST",

    PRODUCTION_KERNEL_DISABLED:
      "AUTONOMOUS_REPAIR_PRODUCTION_KERNEL_DISABLED"
  });

function exactAuthority(
  authority
) {
  const expected =
    [
      "readOnly",
      "filesystemWriteAuthorized",
      "repairAuthorized",
      "executionAuthorized",
      "rollbackExecutionAuthorized",
      "replayConsumptionAuthorized",
      "workflowMutationAuthorized"
    ];

  const actual =
    Object.keys(
      authority ?? {}
    ).sort();

  const wanted =
    [...expected]
      .sort();

  if (
    JSON.stringify(
      actual
    ) !==
    JSON.stringify(
      wanted
    )
  ) {
    throw new Error(
      "autonomous_repair_system_health_authority_shape_invalid"
    );
  }

  if (
    authority.readOnly !==
      true ||
    authority.filesystemWriteAuthorized !==
      false ||
    authority.repairAuthorized !==
      false ||
    authority.executionAuthorized !==
      false ||
    authority.rollbackExecutionAuthorized !==
      false ||
    authority.replayConsumptionAuthorized !==
      false ||
    authority.workflowMutationAuthorized !==
      false
  ) {
    throw new Error(
      "autonomous_repair_system_health_authority_not_read_only"
    );
  }

  return Object.freeze({
    readOnly:
      true,

    filesystemWriteAuthorized:
      false,

    repairAuthorized:
      false,

    executionAuthorized:
      false,

    rollbackExecutionAuthorized:
      false,

    replayConsumptionAuthorized:
      false,

    workflowMutationAuthorized:
      false
  });
}

function healthCodeForState(
  state
) {
  if (
    state ===
    AUTONOMOUS_REPAIR_PRODUCTION_EXECUTION_STATE.BLOCKED_NO_PINNED_TRUST
  ) {
    return AUTONOMOUS_REPAIR_SYSTEM_HEALTH_CODE.NO_PINNED_TRUST;
  }

  if (
    state ===
    AUTONOMOUS_REPAIR_PRODUCTION_EXECUTION_STATE.BLOCKED_PRODUCTION_KERNEL_NOT_ENABLED
  ) {
    return AUTONOMOUS_REPAIR_SYSTEM_HEALTH_CODE.PRODUCTION_KERNEL_DISABLED;
  }

  throw new Error(
    "autonomous_repair_system_health_readiness_state_invalid"
  );
}

export function buildAutonomousRepairSystemHealthFacts() {
  const readiness =
    inspectAutonomousRepairProductionExecutionReadiness();

  const authority =
    exactAuthority(
      readiness.authority
    );

  const code =
    healthCodeForState(
      readiness.state
    );

  if (
    readiness.productionKernelEnabled !==
      false
  ) {
    throw new Error(
      "autonomous_repair_system_health_production_kernel_unexpectedly_enabled"
    );
  }

  if (
    readiness.pinnedTrustRequired !==
      true ||
    readiness.callerSuppliedTrustForbidden !==
      true ||
    readiness.callerSuppliedProjectRootForbidden !==
      true
  ) {
    throw new Error(
      "autonomous_repair_system_health_boundary_contract_invalid"
    );
  }

  return Object.freeze({
    schema:
      AUTONOMOUS_REPAIR_SYSTEM_HEALTH_SCHEMA,

    version:
      AUTONOMOUS_REPAIR_SYSTEM_HEALTH_VERSION,

    role:
      "read_only_autonomous_repair_health_facts",

    mode:
      AUTONOMOUS_REPAIR_SYSTEM_HEALTH_MODE.OBSERVABILITY_ONLY,

    status:
      AUTONOMOUS_REPAIR_SYSTEM_HEALTH_STATUS.EXPECTED_FAIL_CLOSED,

    systemHealthSeverity:
      "info",

    code,

    executionAvailable:
      false,

    readiness:
      Object.freeze({
        state:
          readiness.state,

        trustedKeyCount:
          readiness.trustedKeyCount,

        pinnedTrustRequired:
          true,

        callerSuppliedTrustForbidden:
          true,

        callerSuppliedProjectRootForbidden:
          true,

        productionKernelEnabled:
          false
      }),

    authority
  });
}
