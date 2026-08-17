import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  modelPriorsArchiveInputFilesSync,
} from "./derived-history-foundation.js";

function writeJson(file, value = {}) {
  fs.mkdirSync(
    path.dirname(file),
    { recursive: true },
  );
  fs.writeFileSync(
    file,
    JSON.stringify(value),
    "utf8",
  );
}

test(
  "model-priors archive selector excludes current calendar-year inputs",
  () => {
    const root =
      fs.mkdtempSync(
        path.join(
          os.tmpdir(),
          "aiml-model-priors-calendar-",
        ),
      );

    try {
      for (
        const season of
        ["2021", "2022", "2023", "2024", "2025", "2026"]
      ) {
        writeJson(
          path.join(
            root,
            "arg.1",
            `${season}.json`,
          ),
          { season },
        );
      }

      writeJson(
        path.join(
          root,
          "conmebol.libertadores",
          "2026.json",
        ),
        { season: "2026" },
      );

      const files =
        modelPriorsArchiveInputFilesSync({
          archiveRoot: root,
          now:
            new Date(
              "2026-08-16T12:00:00.000Z",
            ),
        });

      const relative =
        files.map(
          file =>
            path
              .relative(root, file)
              .replaceAll(path.sep, "/"),
        );

      assert.deepEqual(
        relative,
        [
          "arg.1/2021.json",
          "arg.1/2022.json",
          "arg.1/2023.json",
          "arg.1/2024.json",
          "arg.1/2025.json",
        ],
      );

      assert.equal(
        relative.includes(
          "arg.1/2026.json",
        ),
        false,
      );

      assert.equal(
        relative.includes(
          "conmebol.libertadores/2026.json",
        ),
        false,
      );
    } finally {
      fs.rmSync(
        root,
        {
          recursive: true,
          force: true,
        },
      );
    }
  },
);

test(
  "model-priors archive selector excludes current cross-year inputs",
  () => {
    const root =
      fs.mkdtempSync(
        path.join(
          os.tmpdir(),
          "aiml-model-priors-cross-",
        ),
      );

    try {
      for (
        const season of
        [
          "2021-2022",
          "2022-2023",
          "2023-2024",
          "2024-2025",
          "2025-2026",
          "2026-2027",
        ]
      ) {
        writeJson(
          path.join(
            root,
            "bel.1",
            `${season}.json`,
          ),
          { season },
        );
      }

      const files =
        modelPriorsArchiveInputFilesSync({
          archiveRoot: root,
          now:
            new Date(
              "2026-08-16T12:00:00.000Z",
            ),
        });

      const relative =
        files.map(
          file =>
            path
              .relative(root, file)
              .replaceAll(path.sep, "/"),
        );

      assert.deepEqual(
        relative,
        [
          "bel.1/2021-2022.json",
          "bel.1/2022-2023.json",
          "bel.1/2023-2024.json",
          "bel.1/2024-2025.json",
          "bel.1/2025-2026.json",
        ],
      );

      assert.equal(
        relative.includes(
          "bel.1/2026-2027.json",
        ),
        false,
      );
    } finally {
      fs.rmSync(
        root,
        {
          recursive: true,
          force: true,
        },
      );
    }
  },
);
