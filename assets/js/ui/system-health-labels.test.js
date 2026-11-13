import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const ui = fs.readFileSync(new URL("./system-health.js", import.meta.url), "utf8");

test("System Health title and loading text are readable", () => {
  assert.match(ui, />System Health<\/span>/);
  assert.match(ui, /Loading\.\.\./);
  assert.doesNotMatch(ui, /Ώθδκ|├Ω|┬╖|έΑΦ|έΑο|έγκ|έγι|έΗΤ|έεΥ|έεΩ|έΦΑ/u);
});

test("status rendering and alert metrics remain present", () => {
  assert.match(ui, /id="system-health-close"/);
  assert.match(ui, /System Health: \$\{esc\(severity\)\}/);
  assert.match(ui, /ACTIVE ALERT/);
  assert.match(ui, /New actionable:/);
  assert.match(ui, /Errors: <b>\$\{esc\(counts\.error \|\| 0\)\}<\/b>/);
});
