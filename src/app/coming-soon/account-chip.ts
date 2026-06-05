// TIM-2352: pure helper that turns a logged-in user's name/email into the
// display strings for the coming-soon header chip. Pulled into a dependency-
// free module so .mjs tests can import without dragging next/headers in.

export type AccountChip =
  | { kind: "none" }
  | { kind: "account"; initial: string; firstName: string };

function titleCase(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function resolveAccountChip(
  fullName: string | null | undefined,
  email: string | null | undefined,
): AccountChip {
  const nameSource = (fullName ?? "").trim();
  if (nameSource) {
    const firstWord = nameSource.split(/\s+/)[0] ?? "";
    if (firstWord) {
      return {
        kind: "account",
        initial: firstWord.charAt(0).toUpperCase(),
        firstName: titleCase(firstWord),
      };
    }
  }

  const emailLocal = (email ?? "").trim().split("@")[0] ?? "";
  if (emailLocal) {
    const cleaned = emailLocal.replace(/[._-]+/g, " ").trim();
    const firstWord = cleaned.split(/\s+/)[0] ?? "";
    if (firstWord) {
      return {
        kind: "account",
        initial: firstWord.charAt(0).toUpperCase(),
        firstName: titleCase(firstWord),
      };
    }
  }

  return { kind: "none" };
}
