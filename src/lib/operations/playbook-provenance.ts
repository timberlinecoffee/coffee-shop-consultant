// TIM-3449: the Operations Playbook was complete by construction.
//
// The 5 August audit found a thirty-second-old account badged "9 of 9 · 100%"
// on a playbook the owner had never opened. TIM-3448 fixed the same failure in
// Financials; this is the other half.
//
// The mechanism here is worse than Financials', and worth stating plainly. The
// page does this:
//
//     const initialDoc = isPlaybookEmpty(stored) ? seededPlaybook(shopType) : stored;
//
// `isPlaybookEmpty` tests `items.length === 0`. The completeness predicate in
// the workspace tests `items.length > 0`. They are the same test. So the
// emptier the owner's document, the more seeded content is substituted for it,
// and every substituted section reports complete the instant the page renders.
// The product filled in the blanks and then congratulated the owner for it.
//
// As in TIM-3448, the content stays. Nine section headings and a worked
// example of what belongs under each is genuinely useful scaffolding for
// someone who has never written an opening checklist. What was missing is the
// distinction between our example and their decision.
//
// WHY NO STORED FINGERPRINT: unlike the financial model, `seededPlaybook()` is
// a pure function of shop type, so the seed can simply be recomputed and
// compared. Nothing to persist, nothing to migrate, and no way for a stored
// marker to drift out of step with the seed it describes.
//
// Item ids are deliberately excluded from the comparison — the seeder mints a
// fresh `local_<random>` id on every call, so comparing ids would report every
// section as edited, always.
//
// No runtime `@/` imports — must stay loadable from `node --test`.

/** Content-bearing fields per section kind. Ids are never compared. */
type Comparable = Record<string, unknown>;

function sopItemShape(item: Comparable): string {
  return [item.text, item.duration_min, item.station, item.cadence].join(" ");
}

function roleItemShape(item: Comparable): string {
  return [item.role, item.responsibilities].join(" ");
}

function vendorItemShape(item: Comparable): string {
  return [item.label, item.contact_name, item.phone, item.email, item.notes].join(" ");
}

function trainingItemShape(item: Comparable): string {
  return [item.phase, item.text].join(" ");
}

/**
 * Which comparison a section uses. Sections not listed here (the recipes
 * pseudo-section, which reads from menu items rather than the document) have
 * no seeded form and are never reported as seeded.
 */
const SHAPE_BY_SECTION: Record<string, (item: Comparable) => string> = {
  opening: sopItemShape,
  closing: sopItemShape,
  cleaning: sopItemShape,
  cash_handling: sopItemShape,
  food_safety: sopItemShape,
  roles: roleItemShape,
  vendor_contacts: vendorItemShape,
  training: trainingItemShape,
};

/** The section keys this module can speak about. */
export const SEEDABLE_SECTION_KEYS = Object.keys(SHAPE_BY_SECTION);

/**
 * Structural, not the real `OperationsPlaybookDocument`: keeps this module free
 * of `@/` imports so it stays testable, and avoids forcing a cast at every call
 * site — which is exactly how the shape mismatch in TIM-3444 stayed hidden.
 */
export type PlaybookLike = object;

interface SectionLike {
  intro?: string | null;
  items?: Comparable[] | null;
}

function sectionShape(key: string, section: SectionLike | null | undefined): string | null {
  const shape = SHAPE_BY_SECTION[key];
  if (!shape || !section) return null;
  const items = Array.isArray(section.items) ? section.items : [];
  // The intro counts: rewriting the preamble and leaving the checklist alone
  // is still the owner making this section theirs.
  return [(section.intro ?? "").trim(), ...items.map(shape)].join("");
}

/**
 * True when this section is still exactly what we seeded.
 *
 * `doc` is the document being displayed; `seed` is `seededPlaybook(shopType)`
 * for the same shop type. Returns false for any section without a seeded form,
 * and false when either side is missing — failing toward "the owner's", which
 * is the safe direction: wrongly withholding a completion someone earned is
 * worse than wrongly granting one.
 */
export function isSectionSeeded(
  key: string,
  doc: PlaybookLike | null | undefined,
  seed: PlaybookLike | null | undefined,
): boolean {
  if (!doc || !seed) return false;
  const a = sectionShape(key, (doc as Record<string, SectionLike>)[key]);
  const b = sectionShape(key, (seed as Record<string, SectionLike>)[key]);
  if (a === null || b === null) return false;
  return a === b;
}

/** Every section whose content is still ours. */
export function seededSections(
  doc: PlaybookLike | null | undefined,
  seed: PlaybookLike | null | undefined,
): string[] {
  return SEEDABLE_SECTION_KEYS.filter((k) => isSectionSeeded(k, doc, seed));
}

/**
 * The sentence a seeded section shows.
 *
 * Matches the voice of `seededStepNotice()` in TIM-3448 deliberately — an
 * owner who meets this pattern in Financials should recognise it here rather
 * than having to learn it twice.
 */
export function seededSectionNotice(sectionLabel?: string | null): string {
  return sectionLabel
    ? `This is an example ${sectionLabel.toLowerCase()} to work from, not your playbook yet. Edit anything here and this section counts as yours.`
    : "This is an example to work from, not your playbook yet. Edit anything here and this section counts as yours.";
}
