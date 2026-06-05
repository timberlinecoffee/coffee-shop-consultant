// TIM-2352: pure helper used by src/proxy.ts to decide whether a request
// belongs to an in-flight OAuth handshake. On those paths the middleware must
// NOT call supabase.auth.getUser() — see proxy.ts for full incident context.

export function isAuthFlowPath(pathname: string, searchParamKeys: Iterable<string>): boolean {
  if (pathname === "/auth/callback" || pathname === "/auth/signout") {
    return true;
  }
  if (pathname === "/") {
    for (const key of searchParamKeys) {
      if (key === "code" || key === "error") return true;
    }
  }
  return false;
}
