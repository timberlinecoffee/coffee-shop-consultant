// TIM-1259: Bi-directional, opt-in link between the Financial Suite Salaries
// module (PersonnelLine, stored in financial_models.forecast_inputs.personnel)
// and the Hiring & Onboarding suite org structure (hiring_plan_roles).
//
// Both live under the same coffee_shop_plans row. The link is matched first by
// the durable PersonnelLine.org_role_id, then by normalized role name. This file
// is the single pure source of truth for the diff + apply logic; it is shared by
// the client panel and the /api/workspaces/financials/org-sync route so the two
// sides can never drift.
//
// Mapping (role-level):
//   role_title          <-> PersonnelLine.role
//   headcount           <-> PersonnelLine.headcount
//   monthly_cost_cents  <-> loaded monthly cost (personnelLoadedMonthlyCents)
//
// Non-destructive rules:
//   - Pulling org -> salaries updates only role name + headcount, and seeds pay
//     from monthly_cost_cents ONLY when the line has no pay yet. It never touches
//     benefits %, fixed benefits, ramp / hire-month, end month, seasonal pattern,
//     pay basis, or cost category. Those are financial-only fields.
//   - Nothing is deleted on either side. A role removed from the org chart leaves
//     its salaries line in place (flagged salaries_only) for the owner to decide.
//   - Pushing salaries -> org refreshes the role's headcount + monthly_cost_cents
//     (loaded) and never removes org roles.

import type { PersonnelLine } from "./financial-projection.ts";
import { personnelLoadedMonthlyCents } from "./financial-projection.ts";
import { toTitleCase } from "./text.ts";

// Subset of hiring_plan_roles the sync cares about.
export interface OrgRole {
  id: string;
  role_title: string;
  headcount: number;
  monthly_cost_cents: number | null;
}

// Payload the client POSTs to upsert org roles when pushing salaries -> org.
export interface OrgRoleUpsert {
  id?: string; // present -> update; absent -> create
  role_title: string;
  headcount: number;
  monthly_cost_cents: number;
}

export type RowStatus = "linked_in_sync" | "linked_diff" | "org_only" | "salaries_only";

export interface OrgSyncRow {
  key: string;
  status: RowStatus;
  matchedBy: "id" | "name" | null;
  roleId: string | null;
  personnelId: string | null;
  orgName: string | null;
  salariesName: string | null;
  orgHeadcount: number | null;
  salariesHeadcount: number | null;
  orgMonthlyCostCents: number | null;
  salariesLoadedMonthlyCents: number | null;
  nameDiffers: boolean;
  headcountDiffers: boolean;
  costDiffers: boolean;
}

export interface OrgSyncDiff {
  rows: OrgSyncRow[];
  counts: {
    linked: number;
    inSync: number;
    diff: number;
    orgOnly: number;
    salariesOnly: number;
  };
}

// Cost is considered to differ only beyond this tolerance (1 currency unit). The
// org figure is a coarse budget; the salaries loaded cost is precise, so tiny
// rounding gaps should not flag a row as out of sync.
const COST_TOLERANCE_CENTS = 100;

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function clampHeadcount(n: unknown): number {
  return typeof n === "number" && n >= 0 ? Math.floor(n) : 0;
}

function genStaffId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `staff:${crypto.randomUUID()}`;
  }
  return `staff:${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

// Pair each personnel line with at most one org role: by org_role_id first, then
// by normalized name among still-unmatched roles. Returns the pairing plus the
// leftover (unmatched) roles and lines.
interface Pairing {
  line: PersonnelLine;
  role: OrgRole;
  matchedBy: "id" | "name";
}

function pair(personnel: PersonnelLine[], roles: OrgRole[]): {
  pairings: Pairing[];
  orgOnly: OrgRole[];
  salariesOnly: PersonnelLine[];
} {
  const rolesById = new Map<string, OrgRole>();
  for (const r of roles) rolesById.set(r.id, r);

  const usedRoleIds = new Set<string>();
  const pairings: Pairing[] = [];
  const salariesOnly: PersonnelLine[] = [];

  // First pass: id links.
  const byNamePending: PersonnelLine[] = [];
  for (const line of personnel) {
    const linked = line.org_role_id ? rolesById.get(line.org_role_id) : undefined;
    if (linked && !usedRoleIds.has(linked.id)) {
      usedRoleIds.add(linked.id);
      pairings.push({ line, role: linked, matchedBy: "id" });
    } else {
      byNamePending.push(line);
    }
  }

  // Second pass: name match against still-unmatched roles.
  for (const line of byNamePending) {
    const match = roles.find((r) => !usedRoleIds.has(r.id) && norm(r.role_title) === norm(line.role));
    if (match) {
      usedRoleIds.add(match.id);
      pairings.push({ line, role: match, matchedBy: "name" });
    } else {
      salariesOnly.push(line);
    }
  }

  const orgOnly = roles.filter((r) => !usedRoleIds.has(r.id));
  return { pairings, orgOnly, salariesOnly };
}

export function computeOrgSyncDiff(personnel: PersonnelLine[], roles: OrgRole[]): OrgSyncDiff {
  const { pairings, orgOnly, salariesOnly } = pair(personnel, roles);
  const rows: OrgSyncRow[] = [];
  let inSync = 0;
  let diff = 0;

  for (const { line, role, matchedBy } of pairings) {
    const loaded = personnelLoadedMonthlyCents(line);
    const orgCost = role.monthly_cost_cents;
    const nameDiffers = norm(role.role_title) !== norm(line.role);
    const headcountDiffers = clampHeadcount(role.headcount) !== clampHeadcount(line.headcount);
    const costDiffers =
      orgCost != null && Math.abs(orgCost - loaded) >= COST_TOLERANCE_CENTS;
    const anyDiff = nameDiffers || headcountDiffers || costDiffers;
    if (anyDiff) diff++;
    else inSync++;
    rows.push({
      key: `pair:${line.id}:${role.id}`,
      status: anyDiff ? "linked_diff" : "linked_in_sync",
      matchedBy,
      roleId: role.id,
      personnelId: line.id,
      orgName: role.role_title,
      salariesName: line.role,
      orgHeadcount: clampHeadcount(role.headcount),
      salariesHeadcount: clampHeadcount(line.headcount),
      orgMonthlyCostCents: orgCost,
      salariesLoadedMonthlyCents: loaded,
      nameDiffers,
      headcountDiffers,
      costDiffers,
    });
  }

  for (const role of orgOnly) {
    rows.push({
      key: `org:${role.id}`,
      status: "org_only",
      matchedBy: null,
      roleId: role.id,
      personnelId: null,
      orgName: role.role_title,
      salariesName: null,
      orgHeadcount: clampHeadcount(role.headcount),
      salariesHeadcount: null,
      orgMonthlyCostCents: role.monthly_cost_cents,
      salariesLoadedMonthlyCents: null,
      nameDiffers: false,
      headcountDiffers: false,
      costDiffers: false,
    });
  }

  for (const line of salariesOnly) {
    rows.push({
      key: `sal:${line.id}`,
      status: "salaries_only",
      matchedBy: null,
      roleId: null,
      personnelId: line.id,
      orgName: null,
      salariesName: line.role,
      orgHeadcount: null,
      salariesHeadcount: clampHeadcount(line.headcount),
      orgMonthlyCostCents: null,
      salariesLoadedMonthlyCents: personnelLoadedMonthlyCents(line),
      nameDiffers: false,
      headcountDiffers: false,
      costDiffers: false,
    });
  }

  return {
    rows,
    counts: {
      linked: pairings.length,
      inSync,
      diff,
      orgOnly: orgOnly.length,
      salariesOnly: salariesOnly.length,
    },
  };
}

export interface ApplyOrgToSalariesResult {
  personnel: PersonnelLine[];
  added: number;
  updated: number;
}

// Pull org -> salaries. `roleIds` (when provided) limits which org roles apply;
// otherwise every role is applied. Updates name + headcount on matched lines and
// adds new lines for org-only roles. Seeds pay from monthly_cost_cents only when
// the matched/new line has no pay yet. Never touches financial-only fields.
export function applyOrgToSalaries(
  personnel: PersonnelLine[],
  roles: OrgRole[],
  opts?: { roleIds?: string[] }
): ApplyOrgToSalariesResult {
  const selected = opts?.roleIds ? new Set(opts.roleIds) : null;
  const applyRoles = roles.filter((r) => !selected || selected.has(r.id));
  const next = personnel.map((l) => ({ ...l }));
  let added = 0;
  let updated = 0;

  for (const role of applyRoles) {
    const headcount = Math.max(0, clampHeadcount(role.headcount));
    let idx = next.findIndex((l) => l.org_role_id === role.id);
    if (idx < 0) {
      idx = next.findIndex((l) => !l.org_role_id && norm(l.role) === norm(role.role_title));
    }
    if (idx >= 0) {
      const line = next[idx];
      line.org_role_id = role.id;
      line.role = toTitleCase(role.role_title);
      line.headcount = headcount;
      // Seed pay only when absent — never clobber an entered salary.
      if ((line.pay_amount_cents ?? 0) <= 0 && (role.monthly_cost_cents ?? 0) > 0) {
        line.pay_basis = "monthly";
        line.pay_amount_cents = Math.round((role.monthly_cost_cents as number) / Math.max(1, headcount));
        delete line.hours_per_week;
      }
      updated++;
    } else {
      const heads = Math.max(1, headcount);
      const perHead =
        (role.monthly_cost_cents ?? 0) > 0
          ? Math.round((role.monthly_cost_cents as number) / heads)
          : 0;
      next.push({
        id: genStaffId(),
        role: toTitleCase(role.role_title),
        headcount: heads,
        pay_basis: "monthly",
        pay_amount_cents: perHead,
        benefits_pct: 0,
        cost_category: "overhead",
        org_role_id: role.id,
      });
      added++;
    }
  }

  return { personnel: next, added, updated };
}

export interface ApplySalariesToOrgResult {
  upserts: OrgRoleUpsert[];
}

// Push salaries -> org. `lineIds` (when provided) limits which personnel lines
// apply. Produces upserts: an update (with id) for matched roles, a create
// (no id) for salaries-only lines. monthly_cost_cents is the loaded monthly cost.
export function applySalariesToOrg(
  personnel: PersonnelLine[],
  roles: OrgRole[],
  opts?: { lineIds?: string[] }
): ApplySalariesToOrgResult {
  const selected = opts?.lineIds ? new Set(opts.lineIds) : null;
  const applyLines = personnel.filter((l) => !selected || selected.has(l.id));
  const rolesById = new Map<string, OrgRole>();
  for (const r of roles) rolesById.set(r.id, r);
  const usedRoleIds = new Set<string>();
  const upserts: OrgRoleUpsert[] = [];

  for (const line of applyLines) {
    let role = line.org_role_id ? rolesById.get(line.org_role_id) : undefined;
    if (role && usedRoleIds.has(role.id)) role = undefined;
    if (!role) {
      role = roles.find((r) => !usedRoleIds.has(r.id) && norm(r.role_title) === norm(line.role));
    }
    const loaded = personnelLoadedMonthlyCents(line);
    const headcount = Math.max(0, clampHeadcount(line.headcount));
    if (role) {
      usedRoleIds.add(role.id);
      upserts.push({
        id: role.id,
        role_title: toTitleCase(line.role),
        headcount,
        monthly_cost_cents: loaded,
      });
    } else {
      upserts.push({
        role_title: toTitleCase(line.role),
        headcount,
        monthly_cost_cents: loaded,
      });
    }
  }

  return { upserts };
}

// After a salaries -> org push, re-establish org_role_id links on any line that
// now has a same-named org role but no id link yet. Pure; returns a new array.
export function relinkAfterPush(personnel: PersonnelLine[], roles: OrgRole[]): PersonnelLine[] {
  const usedRoleIds = new Set<string>(
    personnel.map((l) => l.org_role_id).filter((x): x is string => !!x)
  );
  return personnel.map((line) => {
    if (line.org_role_id) return line;
    const match = roles.find((r) => !usedRoleIds.has(r.id) && norm(r.role_title) === norm(line.role));
    if (!match) return line;
    usedRoleIds.add(match.id);
    return { ...line, org_role_id: match.id };
  });
}
