import { AlertTriangle } from "lucide-react";

// TIM-3017: Warning banner shown at the top of the regenerate-all review modal
// whenever sections have been generated but not yet accepted or rejected.
// Auto-clears (caller removes it) when all pending sections are resolved.
// No dismiss button — this is a safety warning, not a notification.
export function RegeneratePreviewBanner() {
  return (
    <div
      role="alert"
      className="mx-6 mt-4 rounded-lg border border-amber-200 border-l-4 border-l-amber-500 bg-amber-50 px-4 py-3"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className="w-4 h-4 text-amber-600 shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-semibold text-gray-900">
            Your new content is not saved yet
          </p>
          <p className="text-sm text-gray-700 mt-0.5">
            Accept each section below to save it. Closing this page or losing your connection before accepting will lose your work.
          </p>
        </div>
      </div>
    </div>
  );
}
