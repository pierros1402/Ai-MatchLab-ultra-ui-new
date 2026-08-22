import fs from "node:fs";

const file = "engine-v1/jobs/refresh-value-artifacts-day.js";
let source = fs.readFileSync(file, "utf8");

function replaceUniqueRegex(text, pattern, replacement, label) {
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`${label}: expected exactly one match, got ${matches.length}`);
  }
  return text.replace(pattern, replacement);
}

source = replaceUniqueRegex(
  source,
  /import\s*\{\s*buildValueA2B2Day\s*\}\s*from\s*["']\.\/build-value-a2-b2-day\.js["'];/g,
  'import {\n  buildValueA2B2Day,\n  shouldFreezeAdjustedValueObservations\n} from "./build-value-a2-b2-day.js";',
  "adjusted Value import"
);

source = replaceUniqueRegex(
  source,
  /(const\s+planB\s*=\s*options\.skipPlanB\s*===\s*true[\s\S]*?deriveValueFromOdds\(date,\s*\{[\s\S]*?)freeze\s*:\s*false(\s*,[\s\S]*?outputMode\s*:\s*["']plan-b-observation["'][\s\S]*?\}\);)/g,
  '$1freeze: shouldFreezeAdjustedValueObservations(date, athensDayKey())$2',
  "Plan B freeze option"
);

fs.writeFileSync(file, source, "utf8");
console.log(JSON.stringify({
  ok: true,
  file,
  contract: "Plan B mutable only before target Athens day"
}, null, 2));
