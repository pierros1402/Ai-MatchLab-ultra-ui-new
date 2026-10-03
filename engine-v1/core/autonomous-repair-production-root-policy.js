import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  readAutonomousRepairProductionEnvironment
} from "./autonomous-repair-production-environment.js";

export const AUTONOMOUS_REPAIR_PRODUCTION_ROOT_POLICY_SCHEMA =
  "ai-matchlab.autonomous-repair-production-root-policy.v1";

export const AUTONOMOUS_REPAIR_PRODUCTION_ROOT_POLICY_VERSION =
  "1.0.0";

const VALIDATED_ROOTS =
  new WeakSet();

function pathForComparison(value) {
  const resolved =
    path.resolve(
      value
    );

  return process.platform ===
    "win32"
    ? resolved.toLowerCase()
    : resolved;
}

function samePath(
  left,
  right
) {
  return pathForComparison(
    left
  ) ===
    pathForComparison(
      right
    );
}

function sameOrDescendant(
  candidate,
  parent
) {
  const candidateResolved =
    path.resolve(
      candidate
    );

  const parentResolved =
    path.resolve(
      parent
    );

  if (
    samePath(
      candidateResolved,
      parentResolved
    )
  ) {
    return true;
  }

  const relative =
    path.relative(
      parentResolved,
      candidateResolved
    );

  return Boolean(
    relative &&
    relative !==
      ".." &&
    !relative.startsWith(
      `..${path.sep}`
    ) &&
    !path.isAbsolute(
      relative
    )
  );
}

function rootsOverlap(
  left,
  right
) {
  return sameOrDescendant(
    left,
    right
  ) ||
    sameOrDescendant(
      right,
      left
    );
}

function realpathNative(value) {
  return fs.realpathSync.native
    ? fs.realpathSync.native(
      value
    )
    : fs.realpathSync(
      value
    );
}

function canonicalRealDirectory(
  configured,
  label
) {
  const text =
    String(
      configured ??
      ""
    ).trim();

  if (
    !text ||
    !path.isAbsolute(
      text
    )
  ) {
    throw new Error(
      `autonomous_repair_production_root_policy_${label}_absolute_required`
    );
  }

  const resolved =
    path.resolve(
      text
    );

  if (
    !fs.existsSync(
      resolved
    )
  ) {
    throw new Error(
      `autonomous_repair_production_root_policy_${label}_missing`
    );
  }

  const stat =
    fs.lstatSync(
      resolved
    );

  if (
    stat.isSymbolicLink() ||
    !stat.isDirectory()
  ) {
    throw new Error(
      `autonomous_repair_production_root_policy_${label}_real_directory_required`
    );
  }

  const real =
    realpathNative(
      resolved
    );

  if (
    !samePath(
      resolved,
      real
    )
  ) {
    throw new Error(
      `autonomous_repair_production_root_policy_${label}_reparse_or_symlink_forbidden`
    );
  }

  return real;
}

function canonicalTempRoot() {
  const configured =
    path.resolve(
      os.tmpdir()
    );

  if (
    !fs.existsSync(
      configured
    )
  ) {
    throw new Error(
      "autonomous_repair_production_root_policy_os_temp_missing"
    );
  }

  return realpathNative(
    configured
  );
}

function assertOutsideOsTemp(
  root,
  tempRoot,
  label
) {
  if (
    sameOrDescendant(
      root,
      tempRoot
    )
  ) {
    throw new Error(
      `autonomous_repair_production_root_policy_${label}_under_os_temp_forbidden`
    );
  }
}

function validateRootSeparation({
  projectRoot,
  externalStateRoot,
  externalBackupRoot
}) {
  if (
    rootsOverlap(
      projectRoot,
      externalStateRoot
    )
  ) {
    throw new Error(
      "autonomous_repair_production_root_policy_project_state_overlap_forbidden"
    );
  }

  if (
    rootsOverlap(
      projectRoot,
      externalBackupRoot
    )
  ) {
    throw new Error(
      "autonomous_repair_production_root_policy_project_backup_overlap_forbidden"
    );
  }

  if (
    rootsOverlap(
      externalStateRoot,
      externalBackupRoot
    )
  ) {
    throw new Error(
      "autonomous_repair_production_root_policy_state_backup_overlap_forbidden"
    );
  }
}

export function resolveAutonomousRepairProductionRoots() {
  if (arguments.length !== 0) {
    throw new Error(
      "autonomous_repair_production_root_policy_caller_roots_forbidden"
    );
  }

  const configured =
    readAutonomousRepairProductionEnvironment();

  const projectRoot =
    canonicalRealDirectory(
      configured.projectRoot,
      "project_root"
    );

  const externalStateRoot =
    canonicalRealDirectory(
      configured.externalStateRoot,
      "external_state_root"
    );

  const externalBackupRoot =
    canonicalRealDirectory(
      configured.externalBackupRoot,
      "external_backup_root"
    );

  const tempRoot =
    canonicalTempRoot();

  assertOutsideOsTemp(
    projectRoot,
    tempRoot,
    "project_root"
  );

  assertOutsideOsTemp(
    externalStateRoot,
    tempRoot,
    "external_state_root"
  );

  assertOutsideOsTemp(
    externalBackupRoot,
    tempRoot,
    "external_backup_root"
  );

  validateRootSeparation({
    projectRoot,
    externalStateRoot,
    externalBackupRoot
  });

  const roots =
    Object.freeze({
      schema:
        AUTONOMOUS_REPAIR_PRODUCTION_ROOT_POLICY_SCHEMA,

      version:
        AUTONOMOUS_REPAIR_PRODUCTION_ROOT_POLICY_VERSION,

      source:
        configured.source,

      callerSuppliedRootsForbidden:
        true,

      durableRootsRequired:
        true,

      projectRoot,

      externalStateRoot,

      externalBackupRoot
    });

  VALIDATED_ROOTS.add(
    roots
  );

  return roots;
}

function canonicalRelativeTargetPath(
  targetPath
) {
  const text =
    String(
      targetPath ??
      ""
    ).trim();

  if (!text) {
    throw new Error(
      "autonomous_repair_production_root_policy_target_path_required"
    );
  }

  if (
    path.isAbsolute(
      text
    ) ||
    /^[A-Za-z]:[\\/]/u.test(
      text
    )
  ) {
    throw new Error(
      "autonomous_repair_production_root_policy_target_absolute_forbidden"
    );
  }

  const normalizedSlash =
    text.replace(
      /\\/gu,
      "/"
    );

  const segments =
    normalizedSlash.split(
      "/"
    );

  if (
    segments.some(
      segment =>
        !segment ||
        segment ===
          "." ||
        segment ===
          ".."
    )
  ) {
    throw new Error(
      "autonomous_repair_production_root_policy_target_path_not_canonical"
    );
  }

  return segments.join(
    "/"
  );
}

function assertExistingTargetAncestorsSafe(
  projectRoot,
  absoluteTarget
) {
  let current =
    path.dirname(
      absoluteTarget
    );

  const chain = [];

  while (
    !samePath(
      current,
      projectRoot
    )
  ) {
    if (
      !sameOrDescendant(
        current,
        projectRoot
      )
    ) {
      throw new Error(
        "autonomous_repair_production_root_policy_target_outside_project"
      );
    }

    chain.push(
      current
    );

    const parent =
      path.dirname(
        current
      );

    if (
      samePath(
        parent,
        current
      )
    ) {
      throw new Error(
        "autonomous_repair_production_root_policy_target_outside_project"
      );
    }

    current =
      parent;
  }

  for (
    const candidate of
      chain.reverse()
  ) {
    if (
      !fs.existsSync(
        candidate
      )
    ) {
      continue;
    }

    const stat =
      fs.lstatSync(
        candidate
      );

    if (
      stat.isSymbolicLink() ||
      !stat.isDirectory()
    ) {
      throw new Error(
        "autonomous_repair_production_root_policy_target_reparse_or_symlink_forbidden"
      );
    }

    const real =
      realpathNative(
        candidate
      );

    if (
      !samePath(
        candidate,
        real
      ) ||
      !sameOrDescendant(
        real,
        projectRoot
      )
    ) {
      throw new Error(
        "autonomous_repair_production_root_policy_target_reparse_or_symlink_forbidden"
      );
    }
  }

  if (
    fs.existsSync(
      absoluteTarget
    )
  ) {
    const targetStat =
      fs.lstatSync(
        absoluteTarget
      );

    if (
      targetStat.isSymbolicLink()
    ) {
      throw new Error(
        "autonomous_repair_production_root_policy_target_reparse_or_symlink_forbidden"
      );
    }

    const targetReal =
      realpathNative(
        absoluteTarget
      );

    if (
      !samePath(
        absoluteTarget,
        targetReal
      ) ||
      !sameOrDescendant(
        targetReal,
        projectRoot
      )
    ) {
      throw new Error(
        "autonomous_repair_production_root_policy_target_reparse_or_symlink_forbidden"
      );
    }
  }
}

export function resolveAutonomousRepairProductionTarget(
  roots,
  targetPath
) {
  if (
    arguments.length !== 2 ||
    !VALIDATED_ROOTS.has(
      roots
    )
  ) {
    throw new Error(
      "autonomous_repair_production_root_policy_validated_roots_required"
    );
  }

  const relativePath =
    canonicalRelativeTargetPath(
      targetPath
    );

  const absolutePath =
    path.resolve(
      roots.projectRoot,
      ...relativePath.split(
        "/"
      )
    );

  if (
    samePath(
      absolutePath,
      roots.projectRoot
    ) ||
    !sameOrDescendant(
      absolutePath,
      roots.projectRoot
    )
  ) {
    throw new Error(
      "autonomous_repair_production_root_policy_target_outside_project"
    );
  }

  assertExistingTargetAncestorsSafe(
    roots.projectRoot,
    absolutePath
  );

  return Object.freeze({
    relativePath,
    absolutePath
  });
}
