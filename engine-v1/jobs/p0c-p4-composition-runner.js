import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  runP0CP4SandboxFoundation,
} from "./p0c-p4-sandbox-orchestrator.js";

export const P0C_P4_COMPOSITION_SCHEMA =
  "ai-matchlab.p0c-p4-composition.v1";

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeRelativePath(value) {
  const text = clean(value).replaceAll("\\", "/");
  if (
    !text ||
    text.startsWith("/") ||
    /^[A-Za-z]:/.test(text) ||
    text.split("/").includes("..")
  ) {
    throw new Error("p0c_p4_composition_path_invalid");
  }
  const normalized = path.posix.normalize(text);
  if (normalized === "." || normalized.startsWith("../")) {
    throw new Error("p0c_p4_composition_path_invalid");
  }
  return normalized;
}

function sha256Buffer(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function asOutputRows(result) {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.outputs)) return result.outputs;
  throw new Error("p0c_p4_composition_family_outputs_invalid");
}

function normalizeAction(row) {
  const action = clean(row?.action || "write").toLowerCase();
  if (action !== "write" && action !== "delete") {
    throw new Error(
      `p0c_p4_composition_action_invalid:${action || "missing"}`,
    );
  }
  return action;
}

function normalizeInventoryRows(rows, expectedInventoryCount) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("p0c_p4_composition_inventory_required");
  }
  if (
    expectedInventoryCount !== null &&
    expectedInventoryCount !== undefined &&
    rows.length !== expectedInventoryCount
  ) {
    throw new Error(
      `p0c_p4_composition_inventory_count_mismatch:${rows.length}:${expectedInventoryCount}`,
    );
  }

  const paths = new Set();
  return rows.map((row, index) => {
    if (!row || typeof row !== "object") {
      throw new Error(
        `p0c_p4_composition_inventory_row_invalid:${index}`,
      );
    }
    const relativePath = normalizeRelativePath(row.file);
    const family = clean(row.rebuildFamily);
    if (!family) {
      throw new Error(
        `p0c_p4_composition_inventory_family_required:${relativePath}`,
      );
    }
    if (clean(row.phase) !== "P4_DERIVED_REBUILD") {
      throw new Error(
        `p0c_p4_composition_inventory_phase_invalid:${relativePath}`,
      );
    }
    if (row.rebuildRequired !== true) {
      throw new Error(
        `p0c_p4_composition_rebuild_required:${relativePath}`,
      );
    }
    if (row.directFileEditAuthorized === true) {
      throw new Error(
        `p0c_p4_composition_direct_edit_forbidden:${relativePath}`,
      );
    }
    if (row.applicationAuthorized === true) {
      throw new Error(
        `p0c_p4_composition_application_forbidden:${relativePath}`,
      );
    }
    if (paths.has(relativePath)) {
      throw new Error(
        `p0c_p4_composition_inventory_duplicate:${relativePath}`,
      );
    }
    paths.add(relativePath);
    return {
      ...row,
      file: relativePath,
      rebuildFamily: family,
    };
  });
}

export function parseP0CP4InventoryJsonl(
  text,
  { expectedInventoryCount = 1291 } = {},
) {
  const source = String(text ?? "");
  const lines = source
    .split(/\r?\n/u)
    .filter(line => line.trim().length > 0);
  const rows = lines.map((line, index) => {
    try {
      return JSON.parse(line);
    }
    catch {
      throw new Error(
        `p0c_p4_composition_inventory_json_invalid:${index + 1}`,
      );
    }
  });
  return normalizeInventoryRows(rows, expectedInventoryCount);
}

export function loadP0CP4InventoryFile({
  inventoryPath,
  expectedInventoryCount = 1291,
  expectedSha256 = null,
} = {}) {
  const sourcePath = path.resolve(clean(inventoryPath));
  if (!clean(inventoryPath) || !fs.existsSync(sourcePath)) {
    throw new Error("p0c_p4_composition_inventory_file_required");
  }
  const content = fs.readFileSync(sourcePath);
  const sha256 = sha256Buffer(content);
  if (
    clean(expectedSha256) &&
    sha256 !== clean(expectedSha256).toLowerCase()
  ) {
    throw new Error("p0c_p4_composition_inventory_hash_mismatch");
  }
  const rows = parseP0CP4InventoryJsonl(content.toString("utf8"), {
    expectedInventoryCount,
  });
  return {
    path: sourcePath,
    sha256,
    rowCount: rows.length,
    rows,
  };
}

export function buildP0CP4CompositionTasks({
  inventoryRows,
  familyRunners,
  expectedInventoryCount = 1291,
} = {}) {
  const rows = normalizeInventoryRows(
    inventoryRows,
    expectedInventoryCount,
  );
  if (!familyRunners || typeof familyRunners !== "object") {
    throw new Error("p0c_p4_composition_family_runners_required");
  }

  const byFamily = new Map();
  for (const row of rows) {
    const familyRows = byFamily.get(row.rebuildFamily) || [];
    familyRows.push(row);
    byFamily.set(row.rebuildFamily, familyRows);
  }

  const tasks = [...byFamily.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([family, familyRows]) => {
      const runner = familyRunners[family];
      if (typeof runner !== "function") {
        throw new Error(
          `p0c_p4_composition_family_runner_missing:${family}`,
        );
      }
      const inventorySet = new Set(familyRows.map(row => row.file));

      return {
        id: `p4:${family}`,
        async run(context) {
          const result = await runner({
            ...context,
            schema: P0C_P4_COMPOSITION_SCHEMA,
            family,
            inventoryRows: familyRows.map(row => ({ ...row })),
            inventoryPaths: [...inventorySet].sort(),
            applicationAuthorized: false,
          });
          if (result?.completeFamilyOutput !== true) {
            throw new Error(
              `p0c_p4_composition_family_output_not_complete:${family}`,
            );
          }

          const emitted = new Map();
          for (const row of asOutputRows(result)) {
            const relativePath = normalizeRelativePath(row?.relativePath);
            if (!inventorySet.has(relativePath)) {
              throw new Error(
                `p0c_p4_composition_family_output_unplanned:${family}:${relativePath}`,
              );
            }
            if (emitted.has(relativePath)) {
              throw new Error(
                `p0c_p4_composition_family_output_duplicate:${family}:${relativePath}`,
              );
            }
            const action = normalizeAction(row);
            if (action === "delete") {
              emitted.set(relativePath, {
                relativePath,
                action: "delete",
              });
            }
            else {
              if (!Object.hasOwn(row || {}, "content")) {
                throw new Error(
                  `p0c_p4_composition_family_output_content_required:${family}:${relativePath}`,
                );
              }
              emitted.set(relativePath, {
                relativePath,
                action: "write",
                content: row.content,
              });
            }
          }

          // A complete deterministic family rebuild defines the retained output
          // set. Inventory members not emitted by that rebuild are stale and
          // become explicit deletion actions; they are never materialized.
          for (const relativePath of inventorySet) {
            if (!emitted.has(relativePath)) {
              emitted.set(relativePath, {
                relativePath,
                action: "delete",
              });
            }
          }

          return [...emitted.values()].sort((a, b) =>
            a.relativePath.localeCompare(b.relativePath),
          );
        },
      };
    });

  return {
    schema: P0C_P4_COMPOSITION_SCHEMA,
    inventoryPathCount: rows.length,
    familyCount: byFamily.size,
    families: [...byFamily.entries()]
      .map(([family, familyRows]) => ({
        family,
        inventoryPathCount: familyRows.length,
      }))
      .sort((a, b) => a.family.localeCompare(b.family)),
    inventoryPaths: rows.map(row => row.file).sort(),
    tasks,
    repositoryApplicationAuthorized: false,
  };
}

export async function runP0CP4Composition({
  sandboxRoot,
  sourceHead,
  sourceTree,
  buildTimestamp,
  inventoryRows = null,
  inventoryPath = null,
  inventorySha256 = null,
  familyRunners,
  expectedInventoryCount = 1291,
  applicationAuthorized = false,
} = {}) {
  if (applicationAuthorized) {
    throw new Error("p0c_p4_composition_application_forbidden");
  }

  const loaded = inventoryRows
    ? {
        path: null,
        sha256: null,
        rows: normalizeInventoryRows(
          inventoryRows,
          expectedInventoryCount,
        ),
      }
    : loadP0CP4InventoryFile({
        inventoryPath,
        expectedInventoryCount,
        expectedSha256: inventorySha256,
      });

  const composition = buildP0CP4CompositionTasks({
    inventoryRows: loaded.rows,
    familyRunners,
    expectedInventoryCount,
  });

  const sandbox = await runP0CP4SandboxFoundation({
    sandboxRoot,
    sourceHead,
    sourceTree,
    buildTimestamp,
    inventoryPaths: composition.inventoryPaths,
    tasks: composition.tasks,
    requireExactInventory: true,
    applicationAuthorized: false,
  });

  return {
    ok: true,
    status: "PASS_P0C_P4_COMPOSITION_SANDBOX_COMPLETE_NO_APPLICATION",
    schema: P0C_P4_COMPOSITION_SCHEMA,
    source: {
      head: clean(sourceHead),
      tree: clean(sourceTree),
    },
    inventory: {
      path: loaded.path,
      sha256: loaded.sha256,
      pathCount: composition.inventoryPathCount,
      familyCount: composition.familyCount,
      families: composition.families,
    },
    sandbox,
    repositoryApplicationAuthorized: false,
  };
}
