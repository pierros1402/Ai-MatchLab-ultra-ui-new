import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source =
  fs.readFileSync(
    new URL(
      "./build-value-day.js",
      import.meta.url
    ),
    "utf8"
  );

test(
  "Plan A records value objects that expand to no markets",
  () => {
    assert.match(
      source,
      /value_object_without_expandable_market/u
    );

    assert.match(
      source,
      /expandedMarkets.length === 0/u
    );
  }
);

test(
  "Plan A stores complete evaluation accounting",
  () => {
    assert.match(
      source,
      /evaluationAccounting/u
    );

    assert.match(
      source,
      /unaccountedFixtureCount/u
    );

    assert.match(
      source,
      /duplicateOutcomeCount/u
    );

    assert.match(
      source,
      /terminalOutcomeCount/u
    );
  }
);

test(
  "Plan A fails closed when evaluation accounting is incomplete",
  () => {
    assert.match(
      source,
      /PLAN_A_EVALUATION_ACCOUNTING_FAILED/u
    );

    assert.match(
      source,
      /terminalOutcomeCount !==/u
    );
  }
);
