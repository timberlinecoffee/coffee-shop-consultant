// TIM-1458: Inventory standalone workspace folded into Equipment & Supplies.
// Legacy URL kept as a redirect so existing bookmarks/links survive.
import { redirect, permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function InventoryRedirect() {
  // permanentRedirect emits a 308 so browsers update bookmarks; the redirect
  // import is kept available for any caller that prefers the soft variant.
  void redirect;
  // TIM-2499: append ?from=inventory so the redirect target can show a
  // one-time informational toast explaining where inventory went.
  permanentRedirect("/workspace/buildout-equipment/supplies?from=inventory");
}
