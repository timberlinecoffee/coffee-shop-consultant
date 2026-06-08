// TIM-2506: seed startup costs when financial_models row is first created.
import type { StartupCostLine } from "../../types/financials";

function id(): string {
  return `local_${Math.random().toString(36).slice(2, 10)}`;
}

const COMMON_ITEMS: Omit<StartupCostLine, "id" | "amount_cents">[] = [
  {
    category: "equipment",
    label: "Espresso Machine",
    note: "Your biggest purchase. A mid-range commercial single-group runs $8K–$15K new. Used machines can save money if you have a trusted service tech.",
  },
  {
    category: "equipment",
    label: "Grinder(s)",
    note: "One on-demand grinder per recipe you pull. Budget for a second dedicated unit if you plan to offer decaf or a single-origin option.",
  },
  {
    category: "equipment",
    label: "Refrigeration",
    note: "Under-counter reach-ins for bar, a pastry case for front of house, and back-stock storage. Get quotes before you finalize the floor plan.",
  },
  {
    category: "build_out",
    label: "Build-Out and Renovation",
    note: "Plumbing, electrical, flooring, walls, and millwork. Get at least three contractor bids and add a 20% contingency on top.",
  },
  {
    category: "licenses",
    label: "Permits and Licenses",
    note: "Business license, health department permit, food handler cards, and a sign permit. Costs and timelines vary by city. Call your health department before lease signing.",
  },
  {
    category: "deposits",
    label: "Rent Deposit",
    note: "Typically first and last month's rent at lease signing. Some landlords ask for two to three months up front. Confirm before you sign.",
  },
  {
    category: "deposits",
    label: "Utility Deposits",
    note: "Gas, electric, and water providers often require deposits for new commercial accounts. Call each one before your lease start date.",
  },
  {
    category: "inventory",
    label: "Opening Inventory",
    note: "Coffee, milk, syrups, cups, lids, sleeves, and food for your first week. Order enough to run full service without an emergency restock.",
  },
  {
    category: "other",
    label: "Working Capital Reserve",
    note: "Cash to cover payroll and operating costs while sales ramp up. Most advisors recommend keeping three months of operating expenses in reserve.",
  },
  {
    category: "other",
    label: "Branding and Signage",
    note: "Logo design, exterior and interior signs, menus, and packaging. Signage costs more than most first-timers expect. Get quotes early.",
  },
];

const ROASTERY_ITEMS: Omit<StartupCostLine, "id" | "amount_cents">[] = [
  {
    category: "equipment",
    label: "Sample Roaster",
    note: "Small-batch roaster for cupping and dialing in new lots. If you plan to roast for wholesale from day one, budget this as a line item now rather than scrambling later.",
  },
  {
    category: "equipment",
    label: "Cupping Equipment",
    note: "Cupping spoons, bowls, a gooseneck kettle, and a dedicated burr grinder for evaluations. Keep it separate from your bar workflow.",
  },
];

const MOBILE_ITEMS: Omit<StartupCostLine, "id" | "amount_cents">[] = [
  {
    category: "other",
    label: "Vehicle or Trailer",
    note: "Your purpose-built cart, trailer, or the tow vehicle to pull it. Factor in title, registration, and any custom fabrication needed to meet health code.",
  },
  {
    category: "other",
    label: "Commissary Fees",
    note: "Most jurisdictions require a licensed commissary for prep and storage. Upfront setup costs plus recurring monthly fees vary by city. Confirm with your health department before signing a commissary lease.",
  },
];

const DRIVE_THRU_ITEMS: Omit<StartupCostLine, "id" | "amount_cents">[] = [
  {
    category: "build_out",
    label: "Drive Lane Construction",
    note: "Curb cuts, pavement, striping, canopy or awning, and directional signage. Bring in a civil engineer early. Drive lane permits can take longer than the build itself.",
  },
  {
    category: "equipment",
    label: "Drive-Thru Speaker System",
    note: "Two-way speaker post at the order board and a headset receiver at the bar. Include installation and the first year of service contract in this number.",
  },
];

export function seededStartupCosts(shopTypes: string[]): StartupCostLine[] {
  const items = [...COMMON_ITEMS];
  if (shopTypes.includes("Roastery cafe")) items.push(...ROASTERY_ITEMS);
  if (shopTypes.includes("Mobile cart or pop-up")) items.push(...MOBILE_ITEMS);
  if (shopTypes.includes("Drive-through or kiosk")) items.push(...DRIVE_THRU_ITEMS);
  return items.map((item) => ({ ...item, id: id(), amount_cents: 0 }));
}
