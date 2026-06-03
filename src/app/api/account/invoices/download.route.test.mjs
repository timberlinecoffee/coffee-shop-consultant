// TIM-1912: Download route auth tests — cross-user 403/404.
// Node built-in test runner: npm test

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Inline the auth logic from the download route to test it without the full
// Next.js runtime. We replicate the three guard conditions:
//   1. No auth session → 401
//   2. Invoice not found (or wrong user via RLS) → 404
//   3. Invoice found but user_id !== current user → 403  (belt-and-suspenders)
//   4. No pdf_storage_path → 404
// ---------------------------------------------------------------------------

function makeAuthClient(user) {
  return {
    async auth_getUser() {
      return user ? { data: { user }, error: null } : { data: { user: null }, error: new Error("not authenticated") };
    },
    async from_invoices_select_id(invoiceId, userId) {
      // Simulates RLS: only returns row if user_id matches
      if (invoiceId === "inv-abc" && userId === "user-1") {
        return { data: { id: "inv-abc", user_id: "user-1", pdf_storage_path: "user-1/INV-001.pdf" }, error: null };
      }
      if (invoiceId === "inv-no-pdf" && userId === "user-1") {
        return { data: { id: "inv-no-pdf", user_id: "user-1", pdf_storage_path: null }, error: null };
      }
      return { data: null, error: { message: "Not found" } };
    },
  };
}

// Inline simulation of the download handler logic
async function simulateDownload({ invoiceId, currentUser, invoiceStore }) {
  if (!currentUser) return { status: 401, body: { error: "Unauthorized" } };

  const { data: invoice, error: fetchErr } = invoiceStore[invoiceId]
    ? { data: invoiceStore[invoiceId], error: null }
    : { data: null, error: { message: "Not found" } };

  if (fetchErr || !invoice) return { status: 404, body: { error: "Invoice not found" } };

  if (invoice.user_id !== currentUser.id) return { status: 403, body: { error: "Forbidden" } };

  if (!invoice.pdf_storage_path) return { status: 404, body: { error: "PDF not yet generated" } };

  return { status: 302, location: `https://supabase.test/storage/v1/sign/${invoice.pdf_storage_path}?token=xxx` };
}

const INVOICE_STORE = {
  "inv-abc": { id: "inv-abc", user_id: "user-1", pdf_storage_path: "user-1/INV-001.pdf" },
  "inv-no-pdf": { id: "inv-no-pdf", user_id: "user-1", pdf_storage_path: null },
};

describe("Download route — authentication", () => {
  test("unauthenticated request → 401", async () => {
    const result = await simulateDownload({ invoiceId: "inv-abc", currentUser: null, invoiceStore: INVOICE_STORE });
    assert.equal(result.status, 401);
  });
});

describe("Download route — authorization", () => {
  test("owner fetches own invoice → 302 redirect", async () => {
    const result = await simulateDownload({
      invoiceId: "inv-abc",
      currentUser: { id: "user-1" },
      invoiceStore: INVOICE_STORE,
    });
    assert.equal(result.status, 302);
    assert.ok(result.location?.includes("INV-001.pdf"), "signed URL should include the PDF path");
  });

  test("cross-user request → 404 (RLS prevents row from being returned)", async () => {
    // When RLS is active, a different user gets no row → 404, not 403.
    // The belt-and-suspenders 403 only fires if RLS somehow passes the row.
    const storeWithWrongUser = {
      "inv-abc": { id: "inv-abc", user_id: "user-1", pdf_storage_path: "user-1/INV-001.pdf" },
    };
    const result = await simulateDownload({
      invoiceId: "inv-abc",
      currentUser: { id: "user-2" },  // different user; RLS would block but here we test the guard
      invoiceStore: {},  // simulates RLS returning nothing for user-2
    });
    assert.equal(result.status, 404);
  });

  test("belt-and-suspenders 403 when user_id mismatch slips past RLS", async () => {
    const leakyStore = {
      "inv-abc": { id: "inv-abc", user_id: "user-1", pdf_storage_path: "user-1/INV-001.pdf" },
    };
    const result = await simulateDownload({
      invoiceId: "inv-abc",
      currentUser: { id: "user-2" },
      invoiceStore: leakyStore,  // simulates RLS failing to block (shouldn't happen in prod)
    });
    assert.equal(result.status, 403);
  });

  test("non-existent invoice → 404", async () => {
    const result = await simulateDownload({
      invoiceId: "inv-does-not-exist",
      currentUser: { id: "user-1" },
      invoiceStore: INVOICE_STORE,
    });
    assert.equal(result.status, 404);
  });

  test("invoice without PDF → 404", async () => {
    const result = await simulateDownload({
      invoiceId: "inv-no-pdf",
      currentUser: { id: "user-1" },
      invoiceStore: INVOICE_STORE,
    });
    assert.equal(result.status, 404);
  });
});
