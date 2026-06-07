// TIM-2447: tests for datasetVersionForDate.

import { test } from "node:test"
import assert from "node:assert/strict"
import { datasetVersionForDate } from "./version.ts"

test("Q1 boundary — January is Q1", () => {
  assert.equal(datasetVersionForDate(new Date("2026-01-15T00:00:00Z")), "2026.Q1")
})

test("Q2 boundary — April is Q2", () => {
  assert.equal(datasetVersionForDate(new Date("2026-04-01T00:00:00Z")), "2026.Q2")
})

test("Q4 boundary — December is Q4", () => {
  assert.equal(datasetVersionForDate(new Date("2026-12-31T23:59:59Z")), "2026.Q4")
})

test("year rollover — Jan 2027 is 2027.Q1", () => {
  assert.equal(datasetVersionForDate(new Date("2027-01-01T00:00:00Z")), "2027.Q1")
})
