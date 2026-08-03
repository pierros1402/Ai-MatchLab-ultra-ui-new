import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const P0C_P4_SANDBOX_MANIFEST_SCHEMA =
  "ai-matchlab.p0c-p4-sandbox-manifest.v1";

function clean(value) {
  return String(value ?? "").trim();
}

function sha256Buffer(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

function normalizedRelativePath(value) {
  const text = clean(value).replaceAll("\\", "/");
  if (
    !text ||
    text.startsWith("/") ||
    /^[A-Za-z]:/.test(text) ||
    text.split("/").includes("..")
  ) {
    throw new Error("p0c_p4_sandbox_output_path_invalid");
  }
  const normalized = path.posix.normalize(text);
  if (normalized === "." || normalized.startsWith("../")) {
    throw new Error("p0c_p4_sandbox_output_path_invalid");
  }
  return normalized;
}

function outputRows(result) {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.outputs)) {
    return result.outputs;
  }
  if (result && typeof result === "object") {
    return Object.entries(result).map(([relativePath, content]) => ({
      relativePath,
      content,
    }));
  }
  throw new Error("p0c_p4_sandbox_task_outputs_invalid");
}

function outputBuffer(content) {
  if (Buffer.isBuffer(content)) return content;
  if (typeof content === "string") {
    return Buffer.from(content, "utf8");
  }
  if (content === undefined) {
    throw new Error("p0c_p4_sandbox_output_content_required");
  }
  return Buffer.from(
    `${JSON.stringify(content, null, 2)}\n`,
    "utf8",
  );
}

function setsEqual(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

export async function runP0CP4SandboxFoundation({
  sandboxRoot,
  sourceHead,
  sourceTree,
  buildTimestamp,
  inventoryPaths,
  tasks,
  requireExactInventory = true,
  applicationAuthorized = false,
} = {}) {
  if (applicationAuthorized) {
    throw new Error("p0c_p4_repository_application_forbidden");
  }
  const rootText = clean(sandboxRoot);
  if (!rootText) {
    throw new Error("p0c_p4_sandbox_root_required");
  }
  const root = path.resolve(rootText);
  if (!clean(sourceHead) || !clean(sourceTree)) {
    throw new Error("p0c_p4_source_binding_required");
  }
  if (!clean(buildTimestamp)) {
    throw new Error("p0c_p4_build_timestamp_required");
  }
  if (!Array.isArray(inventoryPaths)) {
    throw new Error("p0c_p4_inventory_paths_required");
  }
  if (!Array.isArray(tasks) || !tasks.length) {
    throw new Error("p0c_p4_tasks_required");
  }

  const inventory = new Set(
    inventoryPaths.map(normalizedRelativePath),
  );
  if (inventory.size !== inventoryPaths.length) {
    throw new Error("p0c_p4_inventory_path_duplicate");
  }

  if (fs.existsSync(root)) {
    throw new Error("p0c_p4_sandbox_root_exists");
  }

  const parent = path.dirname(root);
  fs.mkdirSync(parent, { recursive: true });
  const staging = path.join(
    parent,
    `.${path.basename(root)}.staging-${process.pid}`,
  );
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });

  const emitted = new Map();
  const taskReports = [];

  try {
    for (const task of tasks) {
      const id = clean(task?.id);
      if (!id || typeof task?.run !== "function") {
        throw new Error("p0c_p4_task_invalid");
      }
      const result = await task.run({
        sandboxRoot: staging,
        sourceHead: clean(sourceHead),
        sourceTree: clean(sourceTree),
        buildTimestamp: clean(buildTimestamp),
        applicationAuthorized: false,
      });
      const rows = outputRows(result);
      const taskPaths = [];

      for (const row of rows) {
        const relativePath = normalizedRelativePath(
          row?.relativePath,
        );
        if (!inventory.has(relativePath)) {
          throw new Error(
            `p0c_p4_unplanned_output_path:${relativePath}`,
          );
        }
        if (emitted.has(relativePath)) {
          throw new Error(
            `p0c_p4_duplicate_output_path:${relativePath}`,
          );
        }
        const content = outputBuffer(row.content);
        const target = path.resolve(staging, relativePath);
        if (!target.startsWith(`${staging}${path.sep}`)) {
          throw new Error("p0c_p4_sandbox_output_path_escape");
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
        emitted.set(relativePath, {
          taskId: id,
          bytes: content.length,
          sha256: sha256Buffer(content),
        });
        taskPaths.push(relativePath);
      }

      taskReports.push({
        id,
        outputCount: taskPaths.length,
        outputPaths: taskPaths.sort(),
      });
    }

    if (
      requireExactInventory &&
      !setsEqual(new Set(emitted.keys()), inventory)
    ) {
      const missing = [...inventory]
        .filter(value => !emitted.has(value))
        .sort();
      throw new Error(
        `p0c_p4_inventory_outputs_missing:${missing.join(",")}`,
      );
    }

    const files = [...emitted.entries()]
      .map(([relativePath, meta]) => ({
        relativePath,
        ...meta,
      }))
      .sort((a, b) =>
        a.relativePath.localeCompare(b.relativePath),
      );

    const manifest = {
      schema: P0C_P4_SANDBOX_MANIFEST_SCHEMA,
      source: {
        head: clean(sourceHead),
        tree: clean(sourceTree),
      },
      buildTimestamp: clean(buildTimestamp),
      sandboxRoot: ".",
      inventoryPathCount: inventory.size,
      outputFileCount: files.length,
      exactInventorySatisfied:
        setsEqual(new Set(emitted.keys()), inventory),
      files,
      tasks: taskReports,
      invariants: {
        repositoryApplicationAuthorized: false,
        unplannedOutputs: 0,
        duplicateOutputs: 0,
        sourceEvidenceRewritten: false,
      },
    };

    const manifestContent = Buffer.from(
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(staging, "P0C_P4_SANDBOX_MANIFEST.json"),
      manifestContent,
    );

    fs.renameSync(staging, root);

    return {
      ok: true,
      status: "PASS_P0C_P4_SANDBOX_OUTPUTS_MATERIALIZED_NO_APPLICATION",
      sandboxRoot: ".",
      manifest,
      manifestSha256: sha256Buffer(manifestContent),
      repositoryApplicationAuthorized: false,
    };
  }
  catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}
