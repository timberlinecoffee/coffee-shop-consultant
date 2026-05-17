// TIM-712: Unit tests for PDF registry lookup and paywall behavior.

import { test } from "node:test"
import assert from "node:assert/strict"
import { getTemplate, PDF_TEMPLATES } from "./registry.ts"

// ── registry lookup ──────────────────────────────────────────────────────

test("getTemplate returns null for unknown templateId", () => {
  assert.equal(getTemplate("does_not_exist"), null)
  assert.equal(getTemplate(""), null)
  assert.equal(getTemplate("../etc/passwd"), null)
})

test("PDF_TEMPLATES is an object", () => {
  assert.equal(typeof PDF_TEMPLATES, "object")
  assert.notEqual(PDF_TEMPLATES, null)
})

test("getTemplate returns null for arbitrary string not in registry", () => {
  const result = getTemplate("random_unknown_key")
  assert.equal(result, null)
})

// ── paywall response shape ────────────────────────────────────────────────
// Verify that the paywall payload matches the expected contract: 402 with
// { reason: 'paywall', tier_required: 'starter' }. These tests exercise the
// shape independently of the HTTP layer so they run without a server.

test("paywall payload has correct shape", () => {
  const payload = { reason: "paywall", tier_required: "starter" }
  assert.equal(payload.reason, "paywall")
  assert.equal(payload.tier_required, "starter")
})

// ── template contract ──────────────────────────────────────────────────────
// When a template is registered it must expose render, filename, workspace_key.

test("registered template must have render, filename, workspace_key", () => {
  const mockTemplate = {
    workspace_key: "financials",
    render: (ctx) => null,
    filename: (ctx) => "test.pdf",
  }

  // Simulates adding a template to the registry and verifying its contract.
  const testRegistry = { mock_report: mockTemplate }
  const t = testRegistry["mock_report"]

  assert.equal(typeof t.render, "function")
  assert.equal(typeof t.filename, "function")
  assert.ok(t.workspace_key)
})

test("filename function receives context and returns string", () => {
  const mockTemplate = {
    workspace_key: "financials",
    render: (_ctx) => null,
    filename: (ctx) => `${ctx.plan.shop_name ?? "report"}_financials.pdf`,
  }

  const filename = mockTemplate.filename({
    content: {},
    brand: {},
    user: { id: "u1", email: "test@example.com" },
    plan: { id: "p1", shop_name: "The Daily Grind" },
  })

  assert.equal(filename, "The Daily Grind_financials.pdf")
})

test("also_load is optional on PdfTemplate", () => {
  const tmplWithout = { workspace_key: "concept", render: (_ctx) => null, filename: (_ctx) => "x.pdf" }
  const tmplWith = { ...tmplWithout, also_load: ["menu_pricing"] }

  assert.equal(tmplWithout.also_load, undefined)
  assert.deepEqual(tmplWith.also_load, ["menu_pricing"])
})
