import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  pruneStaleDetailsFiles
} from "../jobs/build-details-day.js";

test("whole-day details prune removes only stale top-level JSON files", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "aiml-details-prune-")
  );

  try {
    const keepA = path.join(dir, "keep-a.json");
    const keepB = path.join(dir, "keep-b.json");
    const stale = path.join(dir, "stale.json");
    const note = path.join(dir, "README.txt");
    const nested = path.join(dir, "nested");

    fs.writeFileSync(keepA, "{}", "utf8");
    fs.writeFileSync(keepB, "{}", "utf8");
    fs.writeFileSync(stale, "{}", "utf8");
    fs.writeFileSync(note, "preserve", "utf8");

    fs.mkdirSync(nested);
    fs.writeFileSync(
      path.join(nested, "nested-stale.json"),
      "{}",
      "utf8"
    );

    const result =
      pruneStaleDetailsFiles(
        dir,
        [keepA, keepB]
      );

    assert.deepEqual(result, {
      ok: true,
      removed: 1,
      files: ["stale.json"]
    });

    assert.equal(fs.existsSync(keepA), true);
    assert.equal(fs.existsSync(keepB), true);
    assert.equal(fs.existsSync(stale), false);
    assert.equal(fs.existsSync(note), true);
    assert.equal(
      fs.existsSync(
        path.join(nested, "nested-stale.json")
      ),
      true
    );
  }
  finally {
    fs.rmSync(dir, {
      recursive: true,
      force: true
    });
  }
});

test("details prune fails closed when expected JSON set is empty", () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "aiml-details-prune-empty-")
  );

  try {
    const existing =
      path.join(dir, "existing.json");

    fs.writeFileSync(
      existing,
      "{}",
      "utf8"
    );

    const result =
      pruneStaleDetailsFiles(
        dir,
        []
      );

    assert.equal(result.ok, false);
    assert.equal(
      result.reason,
      "empty_expected_details_set"
    );
    assert.equal(result.removed, 0);
    assert.deepEqual(result.files, []);
    assert.equal(
      fs.existsSync(existing),
      true
    );
  }
  finally {
    fs.rmSync(dir, {
      recursive: true,
      force: true
    });
  }
});

test("prune is scoped to whole-day rebuild and not partial detail backfill", () => {
  const source = fs.readFileSync(
    new URL(
      "../jobs/build-details-day.js",
      import.meta.url
    ),
    "utf8"
  );

  const wholeStart =
    source.indexOf(
      "export async function buildDetailsDay"
    );

  const partialStart =
    source.indexOf(
      "export async function ensureDetailsForFixtures"
    );

  assert.ok(wholeStart >= 0);
  assert.ok(partialStart > wholeStart);

  const whole =
    source.slice(
      wholeStart,
      partialStart
    );

  const partial =
    source.slice(partialStart);

  assert.match(
    whole,
    /if \(rebuild\)[\s\S]*pruneStaleDetailsFiles/
  );

  assert.doesNotMatch(
    partial,
    /pruneStaleDetailsFiles/
  );

  assert.ok(
    whole.indexOf(
      "pruneStaleDetailsFiles"
    ) >
    whole.indexOf(
      "for (const match of rows)"
    )
  );
});
