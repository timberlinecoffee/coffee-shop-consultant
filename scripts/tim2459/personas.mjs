// TIM-2459: persona configs for QA-2457 multi-persona walkthrough.
// Each persona drives one walkthrough run; output goes to verify-tim2459/<slug>/.

export const PERSONAS = [
  {
    slug: "p1-seattle-large-cafe",
    label: "Persona 1 — Large café, Seattle WA, USA",
    email: "qa-persona1-seattle@groundwork-test.com",
    countryCode: "US",
    currencyCode: "USD",
    hiringCountry: "US",
    shopName: "Pioneer Square Coffee Co.",
    city: "Seattle, WA, USA",
    shopType: ["Full cafe with food"],
    stage: "Just exploring",
    viewport: { width: 1440, height: 900 },
    mobile: false,
    // Persona profile narrative for plan_name + AI-context fields
    profile:
      "60+ seat full-service café with espresso bar, full kitchen serving breakfast and lunch, and 4-barista shifts during peak. Targeting Pioneer Square commuter + tourist mix.",
  },
  {
    slug: "p2-austin-mobile-cart",
    label: "Persona 2 — Mobile coffee cart, Austin TX, USA",
    email: "qa-persona2-austin@groundwork-test.com",
    countryCode: "US",
    currencyCode: "USD",
    hiringCountry: "US",
    shopName: "Lone Star Coffee Cart",
    city: "Austin, TX, USA",
    shopType: ["Mobile cart or pop-up"],
    stage: "Just exploring",
    viewport: { width: 1440, height: 900 },
    mobile: false,
    profile:
      "1–2 staff mobile cart serving farmers' markets, downtown lunch crowds, and weekend events. Minimal equipment, single espresso machine, ~30 drinks/hour throughput.",
  },
  {
    slug: "p3-calgary-drive-thru",
    label: "Persona 3 — Drive-thru, Calgary AB, Canada",
    email: "qa-persona3-calgary@groundwork-test.com",
    countryCode: "CA",
    currencyCode: "CAD",
    hiringCountry: "CA",
    shopName: "Foothills Drive-Thru Coffee",
    city: "Calgary, AB, Canada",
    shopType: ["Drive-through or kiosk"],
    stage: "Just exploring",
    viewport: { width: 1440, height: 900 },
    mobile: false,
    profile:
      "Single-lane drive-thru with walk-up window, 2-shift staffing, high-throughput espresso drinks and grab-and-go pastries. No indoor seating.",
  },
  {
    slug: "p4-toronto-coworking",
    label: "Persona 4 — Co-working café, Toronto ON, Canada",
    email: "qa-persona4-toronto@groundwork-test.com",
    countryCode: "CA",
    currencyCode: "CAD",
    hiringCountry: "CA",
    shopName: "Queen West Co-Brew",
    city: "Toronto, ON, Canada",
    shopType: ["Full cafe with food"], // NOTE: no "Co-working" option exists — M-04 finding
    stage: "Just exploring",
    viewport: { width: 1440, height: 900 },
    mobile: false,
    profile:
      "Hybrid café + co-working space with day-pass members, monthly memberships, drop-in customers, meeting-room rental, and full coffee + light food program.",
  },
  {
    slug: "p5-melbourne-third-wave",
    label: "Persona 5 — Third-wave neighborhood shop, Melbourne, Australia",
    email: "qa-persona5-melbourne@groundwork-test.com",
    countryCode: "AU",
    currencyCode: "AUD",
    hiringCountry: "AU",
    shopName: "Fitzroy Single Origin",
    city: "Melbourne, VIC, Australia",
    shopType: ["Espresso bar (drinks only)"],
    stage: "Just exploring",
    viewport: { width: 375, height: 812 },
    mobile: true,
    profile:
      "Specialty third-wave espresso bar in Fitzroy. Single-origin pour-overs, batch brew, milk-based espresso program, minimal food (pastries + toasties). Local neighborhood regulars.",
  },
  {
    slug: "p6-mexico-roaster-cafe",
    label: "Persona 6 — Roaster + retail café, Mexico City, Mexico",
    email: "qa-persona6-mexico@groundwork-test.com",
    countryCode: "MX",
    currencyCode: "MXN",
    hiringCountry: null, // MX not in HiringCountry enum — fallback expected (M-08)
    shopName: "Roma Norte Tostaduría",
    city: "Mexico City, CDMX, Mexico",
    shopType: ["Roastery cafe"],
    stage: "Just exploring",
    viewport: { width: 375, height: 812 },
    mobile: true,
    profile:
      "Small-batch roaster with adjoining retail café in Roma Norte. Single-origin Mexican coffees, wholesale to nearby restaurants, retail bag sales, espresso bar with light pastries.",
  },
];

export function personaBySlug(slug) {
  const p = PERSONAS.find((x) => x.slug === slug);
  if (!p) throw new Error(`unknown persona slug: ${slug}`);
  return p;
}
