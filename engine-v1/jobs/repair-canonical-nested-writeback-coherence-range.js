import fs from "node:fs";
import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  findCanonicalStatusConflicts
} from "../core/canonical-status-coherence.js";

import {
  applyCanonicalNestedWritebackRepair
} from "../core/canonical-nested-writeback-repair.js";

import {
  resolveDataPath
} from "../storage/data-root.js";

function clean(value) {
  return String(value ?? "").trim();
}

function isDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/u
    .test(clean(value));
}

function readJson(file) {
  return JSON.parse(
    fs.readFileSync(
      file,
      "utf8"
    )
  );
}

function rowsWithShape(payload) {
  if (Array.isArray(payload)) {
    return {
      rows:
        payload,
      key:
        null
    };
  }

  for (
    const key of
    [
      "fixtures",
      "matches",
      "rows"
    ]
  ) {
    if (
      Array.isArray(
        payload?.[key]
      )
    ) {
      return {
        rows:
          payload[key],
        key
      };
    }
  }

  return {
    rows: [],
    key: null
  };
}

function rowId(row) {
  return clean(
    row?.canonicalId ||
    row?.matchId ||
    row?.id
  );
}

function writeJsonAtomic(
  file,
  payload
) {
  const temp =
    `${file}.tmp-${process.pid}-${Date.now()}`;

  fs.writeFileSync(
    temp,
    `${JSON.stringify(
      payload,
      null,
      2
    )}\n`,
    "utf8"
  );

  fs.renameSync(
    temp,
    file
  );
}

function availableDays(root) {
  if (!fs.existsSync(root)) {
    return [];
  }

  return fs
    .readdirSync(
      root,
      {
        withFileTypes:
          true
      }
    )
    .filter(entry =>
      entry.isDirectory() &&
      isDayKey(
        entry.name
      )
    )
    .map(entry =>
      entry.name
    )
    .sort();
}

export function repairCanonicalNestedWritebackCoherenceRange({
  from = "",
  to = "",
  write = false,
  repairedAt =
    new Date().toISOString(),
  canonicalRoot =
    resolveDataPath(
      "canonical-fixtures"
    ),
  finalRoot =
    resolveDataPath(
      "final-results"
    )
} = {}) {
  const requestedFrom =
    clean(from);

  const requestedTo =
    clean(to);

  if (
    requestedFrom &&
    !isDayKey(
      requestedFrom
    )
  ) {
    throw new Error(
      `invalid_from_day:${requestedFrom}`
    );
  }

  if (
    requestedTo &&
    !isDayKey(
      requestedTo
    )
  ) {
    throw new Error(
      `invalid_to_day:${requestedTo}`
    );
  }

  if (
    requestedFrom &&
    requestedTo &&
    requestedFrom >
      requestedTo
  ) {
    throw new Error(
      `invalid_day_range:${requestedFrom}:${requestedTo}`
    );
  }

  const allDays =
    availableDays(
      canonicalRoot
    );

  const days =
    allDays.filter(day =>
      (
        !requestedFrom ||
        day >= requestedFrom
      ) &&
      (
        !requestedTo ||
        day <= requestedTo
      )
    );

  if (
    (
      requestedFrom ||
      requestedTo
    ) &&
    days.length === 0
  ) {
    throw new Error(
      `canonical_nested_writeback_repair_range_empty:${requestedFrom || "*"}:${requestedTo || "*"}`
    );
  }

  const report = {
    schema:
      "ai-matchlab.canonical-nested-writeback-coherence-repair-range.v1",

    generatedAt:
      repairedAt,

    from:
      requestedFrom || null,

    to:
      requestedTo || null,

    writeRequested:
      write === true,

    daysScanned:
      days.length,

    filesScanned:
      0,

    rowsScanned:
      0,

    conflictRows:
      0,

    repairableRows:
      0,

    repairedRows:
      0,

    filesWritten:
      0,

    byMode:
      {},

    unresolvedByReason:
      {},

    repairs:
      [],

    unresolved:
      []
  };

  for (const dayKey of days) {
    const dir =
      path.join(
        canonicalRoot,
        dayKey
      );

    const files =
      fs
        .readdirSync(
          dir
        )
        .filter(name =>
          name.endsWith(
            ".json"
          )
        )
        .sort();

    for (const name of files) {
      const file =
        path.join(
          dir,
          name
        );

      const payload =
        readJson(
          file
        );

      const shaped =
        rowsWithShape(
          payload
        );

      report.filesScanned++;
      report.rowsScanned +=
        shaped.rows.length;

      let changed =
        false;

      const nextRows =
        shaped.rows.map(
          (row, index) => {
            const conflicts =
              findCanonicalStatusConflicts(
                {
                  fixtures:
                    [row]
                },
                {
                  path:
                    file
                }
              );

            if (
              conflicts.length ===
                0
            ) {
              return row;
            }

            report.conflictRows++;

            const matchId =
              rowId(
                row
              );

            const finalFile =
              matchId
                ? path.join(
                    finalRoot,
                    dayKey,
                    `${matchId}.json`
                  )
                : "";

            const finalResult =
              finalFile &&
              fs.existsSync(
                finalFile
              )
                ? readJson(
                    finalFile
                  )
                : null;

            const result =
              applyCanonicalNestedWritebackRepair({
                canonicalRow:
                  row,
                finalResult,
                dayKey,
                repairedAt
              });

            if (
              !result.changed
            ) {
              const reason =
                result.reason ||
                "repair_not_applied";

              report.unresolved.push({
                dayKey,
                file:
                  name,
                index,
                matchId:
                  matchId ||
                  null,
                reason
              });

              report.unresolvedByReason[
                reason
              ] =
                Number(
                  report
                    .unresolvedByReason[
                      reason
                    ] ||
                  0
                ) + 1;

              return row;
            }

            changed =
              true;

            report.repairableRows++;
            report.repairedRows++;

            const mode =
              result
                .evaluation
                .mode;

            report.byMode[
              mode
            ] =
              Number(
                report
                  .byMode[
                    mode
                  ] ||
                0
              ) + 1;

            report.repairs.push({
              dayKey,
              file:
                name,
              index,
              matchId:
                matchId ||
                null,
              mode,
              provider:
                result
                  .row
                  ?.source ??
                null,
              providerMatchId:
                result
                  .row
                  ?.sourceId ??
                result
                  .row
                  ?.sourceMatchId ??
                null
            });

            return result.row;
          }
        );

      if (!changed) {
        continue;
      }

      const nextPayload =
        shaped.key ===
          null
          ? nextRows
          : {
              ...payload,
              [shaped.key]:
                nextRows,
              updatedAt:
                repairedAt
            };

      for (
        const repair of
        report.repairs.filter(
          item =>
            item.dayKey ===
              dayKey &&
            item.file ===
              name
        )
      ) {
        const row =
          nextRows[
            repair.index
          ];

        const remaining =
          findCanonicalStatusConflicts(
            {
              fixtures:
                [row]
            },
            {
              path:
                file
            }
          );

        if (
          remaining.length >
            0
        ) {
          throw new Error(
            `nested_writeback_repair_postcondition_failed:${dayKey}:${name}:${repair.index}:${remaining.length}`
          );
        }
      }

      if (
        write === true
      ) {
        writeJsonAtomic(
          file,
          nextPayload
        );

        report.filesWritten++;
      }
    }
  }

  report.unresolvedRows =
    report.unresolved.length;

  report.complete =
    report.unresolvedRows ===
      0;

  report.ok =
    true;

  report.writeApplied =
    write === true;

  return report;
}

const isCli =
  process.argv[1] &&
  fileURLToPath(
    import.meta.url
  ) ===
    path.resolve(
      process.argv[1]
    );

if (isCli) {
  try {
    const args =
      process.argv
        .slice(2)
        .map(clean);

    const from =
      args
        .find(arg =>
          arg.startsWith(
            "--from="
          )
        )
        ?.slice(
          "--from=".length
        ) || "";

    const to =
      args
        .find(arg =>
          arg.startsWith(
            "--to="
          )
        )
        ?.slice(
          "--to=".length
        ) || "";

    const write =
      args.includes(
        "--write"
      );

    const result =
      repairCanonicalNestedWritebackCoherenceRange({
        from,
        to,
        write
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
      error
    );
    process.exit(1);
  }
}
