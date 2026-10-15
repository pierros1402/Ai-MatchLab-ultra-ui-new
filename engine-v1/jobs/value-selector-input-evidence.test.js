import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { deriveValueFromOdds } from "./derive-value-from-odds.js";
import { createValueDecisionEvidence } from "../storage/value-decision-evidence.js";
import { resolveDataPath, getDataRoot } from "../storage/data-root.js";

test("B/B2 capture actual joined assessments and missing rows without changing picks or frozen observations", () => {
  const day = "2099-12-29", id = "cid_input_evidence_b";
  const canonical = resolveDataPath("canonical-fixtures", day), output = resolveDataPath("value-plans", day);
  const evidenceRoot = resolveDataPath(`test-selector-evidence-${crypto.randomUUID()}`);
  const odds = resolveDataPath("odds-memory", `${id}.json`);
  for (const file of [canonical, output, evidenceRoot, odds]) assert.equal(fs.existsSync(file), false);
  const owned = [];
  try {
    for (const dir of [canonical, output, evidenceRoot]) { fs.mkdirSync(dir, { recursive: true }); owned.push(dir); }
    fs.mkdirSync(path.dirname(odds), { recursive: true });
    const fixture = { canonicalId: id, matchId: id, leagueSlug: "test.1", homeTeam: "Evidence Home", awayTeam: "Evidence Away", kickoffUtc: `${day}T18:00:00Z`, dayKey: day, status: "PRE" };
    fs.writeFileSync(path.join(canonical, "test.1.json"), JSON.stringify({ date: day, fixtures: [fixture, {
      ...fixture, canonicalId: "cid_input_evidence_missing", matchId: "cid_input_evidence_missing", awayTeam: "Missing Assessment Away"
    }] }), { flag: "wx" });
    fs.writeFileSync(odds, JSON.stringify({ ...fixture, home: fixture.homeTeam, away: fixture.awayTeam,
      aiAssessment: { model: { source: "ai_poisson_standings_plus_form", formUsed: true, homeFormSample: 5, awayFormSample: 5 },
        markets: { OU25: { probs: { over: .83, under: .17 } } } }
    }), { flag: "wx" });
    for (const [mode, slug] of [["plan-b-observation", "plan-b"], ["plan-b2-observation", "plan-b2"]]) {
      const result = deriveValueFromOdds(day, { outputMode: mode,
        decisionEvidenceFactory: (date, plan, inputs) => createValueDecisionEvidence(date, plan, inputs, { dataRoot: evidenceRoot }) });
      assert.equal(result.count, 1); assert.equal(result.picks[0].modelProb, .83);
      const audit = JSON.parse(fs.readFileSync(path.join(output, `${slug}-audit.json`)));
      assert.equal(audit.membership.canonicalRowsWithoutAssessment, 1);
      const records = audit.decisionInputEvidence.records;
      assert.ok(records.some(r => r.stage === "missing_assessment" && r.canonicalMatchId === "cid_input_evidence_missing"));
      const ref = records.find(r => r.stage === "assessment_selector_arguments").receipt;
      const receiptFile = path.join(evidenceRoot, ref.path.replace(/^data\//u, ""));
      const receipt = JSON.parse(fs.readFileSync(receiptFile));
      const match = JSON.parse(fs.readFileSync(path.join(evidenceRoot, receipt.inputs.match.path.replace(/^data\//u, ""))));
      assert.equal(match.aiAssessment.markets.OU25.probs.over, .83);
      assert.equal(match.canonicalId, id);
      if (slug === "plan-b2") assert.ok(match.aiAssessment.model.opponentAdjustedProfiles);
      const before = fs.readFileSync(path.join(output, `${slug}.json`));
      const frozen = deriveValueFromOdds(day, { outputMode: mode, freeze: true,
        decisionEvidenceFactory() { throw new Error("frozen observation must return before capturing new inputs"); } });
      assert.deepEqual(frozen.picks, result.picks);
      assert.deepEqual(fs.readFileSync(path.join(output, `${slug}.json`)), before);
    }
  } finally {
    if (fs.existsSync(odds)) fs.unlinkSync(odds);
    for (const directory of owned) {
      const checked = fs.realpathSync(directory);
      assert.ok(checked.startsWith(fs.realpathSync(getDataRoot()) + path.sep));
      assert.notEqual(checked, fs.realpathSync(getDataRoot()));
      fs.rmSync(checked, { recursive: true });
    }
  }
});
