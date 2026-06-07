// TIM-1458: Inventory standalone workspace folded into Equipment & Supplies.
// Legacy URL kept as a redirect so existing bookmarks/links survive.
import { redirect, permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function InventoryRedirect() {
  // permanentRedirect emits a 308 so browsers update bookmarks; the redirect
  // import is kept available for any caller that prefers the soft variant.
  void redirect;
  permanentRedirect("/workspace/buildout-equipment/supplies");
}
