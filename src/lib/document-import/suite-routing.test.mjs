// TIM-2434: pin tests for suite-routing.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  routeExtractedChanges,
  countBySuite,
} from "./suite-routing.ts";

test("routeExtractedChanges maps suites to canonical workspace labels", () => {
  const out = routeExtractedChanges({
    changes: [
      {
        suite: "business_plan",
        fieldKey: "exec_summary",
        fieldLabel: "Executive Summary",
        proposedValue: "We open in Q1.",
        sourceFileName: "plan.pdf",
        confidence: "high",
      },
      {
        suite: "financials",
        fieldKey: "rent_monthly",
        fieldLabel: "Rent (monthly)",
        proposedValue: "8500",
        sourceFileName: "lease.pdf",
        confidence: "high",
      },
      {
        suite: "concept_brand",
        fieldKey: "brand_name",
        fieldLabel: "Brand Name",
        proposedValue: "Beaver & Beef",
        sourceFileName: "logo.png",
        confidence: "high",
      },
    ],
  });
  assert.equal(out.length, 3);
  assert.equal(out[0].workspaceLabel, "Business Plan");
  assert.equal(out[1].workspaceLabel, "Financials");
  assert.equal(out[2].workspaceLabel, "Concept & Brand");
});

test("provenance line uses 'From: <fileName>' format the modal expects", () => {
  const [r] = routeExtractedChanges({
    changes: [
      {
        suite: "business_plan",
        fieldKey: "mission",
        fieldLabel: "Mission",
        proposedValue: "Serve great coffee.",
        sourceFileName: "quarterly-report.pdf",
        confidence: "high",
      },
    ],
  });
  assert.equal(r.provenance, "From: quarterly-report.pdf");
});

test("existingValues populate originalValue so the modal renders 'Currently: ...'", () => {
  const [r] = routeExtractedChanges({
    changes: [
      {
        suite: "financials",
        fieldKey: "rent_monthly",
        fieldLabel: "Rent (monthly)",
        proposedValue: "8500",
        sourceFileName: "lease.pdf",
        confidence: "high",
      },
    ],
    existingValues: { "financials:rent_monthly": "7200" },
  });
  assert.equal(r.originalValue, "7200");
});

test("low confidence flags the field label so reviewer sees the signal", () => {
  const [r] = routeExtractedChanges({
    changes: [
      {
        suite: "business_plan",
        fieldKey: "swot_strengths",
        fieldLabel: "Strengths",
        proposedValue: "Strong location.",
        sourceFileName: "swot.docx",
        confidence: "low",
      },
    ],
  });
  assert.ok(r.fieldLabel.startsWith("[low confidence]"));
});

test("idPrefix scopes SuggestionPayload ids per import session", () => {
  const [r] = routeExtractedChanges({
    changes: [
      {
        suite: "business_plan",
        fieldKey: "mission",
        fieldLabel: "Mission",
        proposedValue: "x",
        sourceFileName: "f.pdf",
        confidence: "high",
      },
    ],
    idPrefix: "imp_abc",
  });
  assert.ok(r.id.startsWith("imp_abc-"));
});

test("countBySuite returns zero for empty suites", () => {
  const counts = countBySuite([
    {
      suite: "business_plan",
      fieldKey: "a",
      fieldLabel: "A",
      proposedValue: "1",
      sourceFileName: "f.pdf",
      confidence: "high",
    },
    {
      suite: "business_plan",
      fieldKey: "b",
      fieldLabel: "B",
      proposedValue: "2",
      sourceFileName: "f.pdf",
      confidence: "high",
    },
    {
      suite: "financials",
      fieldKey: "c",
      fieldLabel: "C",
      proposedValue: "3",
      sourceFileName: "f.pdf",
      confidence: "high",
    },
  ]);
  assert.deepEqual(counts, {
    business_plan: 2,
    financials: 1,
    concept_brand: 0,
  });
});
