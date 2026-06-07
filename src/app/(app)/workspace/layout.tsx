// TIM-2461: auth, currency, and the WorkspaceProgressProvider now live in the
// shared (app) layout so the sidebar persists across /dashboard ↔ /workspace
// transitions. This file is kept as a pass-through for any future
// workspace-only chrome.
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
