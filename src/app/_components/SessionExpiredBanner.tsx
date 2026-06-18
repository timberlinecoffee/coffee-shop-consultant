import { Clock } from "lucide-react";

// TIM-2732: when (app)/layout.tsx or src/proxy.ts redirects an unauthenticated
// visitor away from a protected path, they append `&expired=1` to the
// /login?next=… URL. Both /login and /landing accept that query parameter and
// render this banner above the form so the visitor reads the bounce as
// "session expired" rather than "the page never loaded" (TIM-2721 cost the
// board one review cycle on exactly this misread). Banner is server-rendered
// off the URL query so it clears the moment the visitor signs in — the
// post-login redirect navigates away from /login and the param goes with it.

export {
  SESSION_EXPIRED_QUERY_PARAM,
  SESSION_EXPIRED_QUERY_VALUE,
  isSessionExpiredFlag,
} from "@/lib/session-expired";

export function SessionExpiredBanner({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2 ${className ?? ""}`}
    >
      <Clock className="w-4 h-4 text-amber-700 mt-[2px] shrink-0" aria-hidden="true" />
      <p className="text-xs text-amber-900 leading-snug">
        Your session expired. Please sign in to continue.
      </p>
    </div>
  );
}
