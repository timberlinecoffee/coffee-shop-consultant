// TIM-2434: pin tests for the document-import credit estimator.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateCreditsPerFile,
  estimateCredits,
} from "./credit-estimate.ts";

test("PDF text layer charges 2 credits per page, rounded up", () => {
  assert.equal(estimateCreditsPerFile({ fileType: "pdf", unitCount: 1 }), 2);
  assert.equal(estimateCreditsPerFile({ fileType: "pdf", unitCount: 10 }), 20);
});

test("PDF scan charges 4 credits per page", () => {
  assert.equal(
    estimateCreditsPerFile({ fileType: "pdf_scan", unitCount: 8 }),
    32,
  );
});

test("DOCX charges ceil(words / 500)", () => {
  assert.equal(
    estimateCreditsPerFile({ fileType: "docx", unitCount: 500 }),
    1,
  );
  assert.equal(
    estimateCreditsPerFile({ fileType: "docx", unitCount: 501 }),
    2,
  );
  assert.equal(
    estimateCreditsPerFile({ fileType: "docx", unitCount: 2400 }),
    5,
  );
});

test("XLSX and CSV charge ceil(rows / 50)", () => {
  assert.equal(
    estimateCreditsPerFile({ fileType: "xlsx", unitCount: 50 }),
    1,
  );
  assert.equal(
    estimateCreditsPerFile({ fileType: "xlsx", unitCount: 51 }),
    2,
  );
  assert.equal(
    estimateCreditsPerFile({ fileType: "csv", unitCount: 200 }),
    4,
  );
});

test("Image charges 4 credits flat", () => {
  assert.equal(estimateCreditsPerFile({ fileType: "png", unitCount: 1 }), 4);
  assert.equal(estimateCreditsPerFile({ fileType: "jpg", unitCount: 1 }), 4);
});

test("Every file is at least 1 credit", () => {
  assert.equal(
    estimateCreditsPerFile({ fileType: "docx", unitCount: 0 }),
    1,
  );
  assert.equal(
    estimateCreditsPerFile({ fileType: "csv", unitCount: 0 }),
    1,
  );
});

test("estimateCredits returns per-file breakdown and total sum", () => {
  const result = estimateCredits([
    { fileType: "pdf", unitCount: 10 }, // 20
    { fileType: "docx", unitCount: 2000 }, // 4
    { fileType: "csv", unitCount: 100 }, // 2
    { fileType: "png", unitCount: 1 }, // 4
  ]);
  assert.equal(result.total, 30);
  assert.equal(result.perFile.length, 4);
  assert.deepEqual(
    result.perFile.map((r) => r.credits),
    [20, 4, 2, 4],
  );
});

test("estimateCredits([]) returns total 0 with empty perFile", () => {
  const result = estimateCredits([]);
  assert.equal(result.total, 0);
  assert.deepEqual(result.perFile, []);
});
