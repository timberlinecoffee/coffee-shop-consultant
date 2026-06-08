"use client";

// TIM-2434: When the user lands on /dashboard?openImport=1 (the link from
// Settings → Documents and the onboarding "existing shop" step), auto-open the
// companion drawer in Import mode. Idempotent: dispatches once per mount.

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export function OpenImportFromQuery() {
  const params = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (params.get("openImport") !== "1") return;
    window.dispatchEvent(
      new CustomEvent("copilot:open-in-mode", {
        detail: { mode: "import", scope: null },
      }),
    );
    // Clean the URL so a back/forward doesn't re-fire.
    router.replace("/dashboard");
  }, [params, router]);
  return null;
}
