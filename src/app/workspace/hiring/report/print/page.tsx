// TIM-965: Competency Evaluation Report — printable, server-rendered, no nav.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import type {
  StaffFile,
  StaffCompetency,
  CompetencyEvaluation,
  OrgRole,
} from "@/lib/hiring";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

function ScoreCircles({ score, max = 5 }: { score: number; max?: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={`inline-block w-3 h-3 rounded-full border ${
            i < score
              ? "bg-[#155e63] border-[#155e63]"
              : "bg-white border-[#d0d0d0]"
          }`}
        />
      ))}
    </span>
  );
}

export default async function HiringReportPrintPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) redirect("/onboarding");

  const planId = plan.id;
  const planName = (plan as { name?: string }).name ?? "Your Shop";

  const [
    { data: staffData },
    { data: competenciesData },
    { data: evalsData },
    { data: rolesData },
  ] = await Promise.all([
    supabase
      .from("staff_files")
      .select("*")
      .eq("plan_id", planId)
      .order("created_at", { ascending: true }),
    supabase
      .from("staff_competencies")
      .select("*")
      .eq("plan_id", planId)
      .order("order_index", { ascending: true }),
    supabase
      .from("competency_evaluations")
      .select("competency_evaluations.*, staff_files!inner(plan_id)")
      .eq("staff_files.plan_id", planId),
    supabase
      .from("hiring_plan_roles")
      .select("*")
      .eq("plan_id", planId),
  ]);

  const staffFiles = (staffData ?? []) as StaffFile[];
  const competencies = (competenciesData ?? []) as StaffCompetency[];
  const roles = (rolesData ?? []) as OrgRole[];

  const cleanEvals = ((evalsData ?? []) as unknown as Array<Record<string, unknown>>).map(
    (row) => ({
      id: row.id,
      staff_file_id: row.staff_file_id,
      competency_id: row.competency_id,
      score: row.score as number,
      notes: row.notes as string | null,
      evaluated_at: row.evaluated_at as string,
    }) as CompetencyEvaluation
  );

  const printDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const year = new Date().getFullYear();

  function getWeightedAvg(staffId: string): number | null {
    let weightedSum = 0;
    let totalWeight = 0;
    for (const comp of competencies) {
      const ev = cleanEvals.find(
        (e) => e.staff_file_id === staffId && e.competency_id === comp.id
      );
      if (ev && ev.score > 0) {
        weightedSum += ev.score * comp.weight;
        totalWeight += comp.weight * 5;
      }
    }
    if (totalWeight === 0) return null;
    return (weightedSum / totalWeight) * 100;
  }

  return (
    <div className="min-h-screen bg-white">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              .no-print { display: none !important; }
              body { margin: 0; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              @page { margin: 1.8cm 2cm; size: A4; }
              .staff-card { break-inside: avoid; }
            }
          `,
        }}
      />

      {/* Action bar */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-[#efefef] px-6 py-3.5 flex items-center justify-between">
        <Link
          href="/workspace/hiring"
          className="text-sm text-[#155e63] font-medium hover:underline flex items-center gap-1.5"
        >
          <span aria-hidden="true">←</span> Back to hiring
        </Link>
        <PrintButton />
      </div>

      <div className="max-w-[680px] mx-auto px-8 pt-14 pb-20">
        {/* Cover header */}
        <header className="mb-12">
          <div className="h-[3px] bg-[#155e63] mb-8 rounded-full" />
          <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#155e63] mb-3">
            Competency Evaluation Report
          </p>
          <h1
            className="font-bold text-[#1a1a1a] leading-tight mb-4"
            style={{ fontSize: "34px", letterSpacing: "-0.01em" }}
          >
            {planName}
          </h1>
          <p className="text-xs text-[#afafaf] tracking-wide">
            {printDate}
            {staffFiles.length > 0 && (
              <>
                {" · "}
                {staffFiles.length} staff member{staffFiles.length !== 1 ? "s" : ""}
              </>
            )}
            {" · "}
            Prepared with Timberline Coffee School
          </p>
          <div className="mt-8 border-t border-[#efefef]" />
        </header>

        {/* Staff reports */}
        {staffFiles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#d4d4d4] px-6 py-10 text-center">
            <p className="text-sm text-[#afafaf] mb-3">No staff files found.</p>
            <Link
              href="/workspace/hiring"
              className="text-sm font-medium text-[#155e63] hover:underline"
            >
              Go back to add staff
            </Link>
          </div>
        ) : (
          <div className="space-y-10">
            {staffFiles.map((staff) => {
              const role = roles.find((r) => r.id === staff.role_id);
              const avg = getWeightedAvg(staff.id);
              const staffEvals = cleanEvals.filter(
                (e) => e.staff_file_id === staff.id
              );

              return (
                <div key={staff.id} className="staff-card">
                  {/* Staff header */}
                  <div className="mb-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <h2
                        className="font-bold text-[#1a1a1a]"
                        style={{ fontSize: "20px" }}
                      >
                        {staff.name || "Unnamed staff"}
                      </h2>
                      {avg !== null && (
                        <span className="text-sm font-semibold text-[#155e63]">
                          {avg.toFixed(0)}% overall
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#6b6b6b] mt-1">
                      {role?.role_title ?? "No role assigned"}
                      {staff.hire_date
                        ? ` · Hired ${new Date(staff.hire_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                        : ""}
                    </p>
                  </div>

                  {/* Competency table */}
                  {competencies.length === 0 ? (
                    <p className="text-sm text-[#afafaf] italic">
                      No competencies defined.
                    </p>
                  ) : (
                    <div className="rounded-xl border border-[#efefef] overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-[#faf9f7] border-b border-[#efefef]">
                            <th className="py-2.5 pl-4 pr-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#afafaf]">
                              Skill
                            </th>
                            <th className="py-2.5 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[#afafaf]">
                              Rubric
                            </th>
                            <th className="py-2.5 px-3 text-center text-[10px] font-semibold uppercase tracking-wider text-[#afafaf]">
                              Score
                            </th>
                            <th className="py-2.5 pr-4 pl-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[#afafaf]">
                              Weighted
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#f5f5f5]">
                          {competencies
                            .sort((a, b) => a.order_index - b.order_index)
                            .map((comp) => {
                              const ev = staffEvals.find(
                                (e) => e.competency_id === comp.id
                              );
                              const score = ev?.score ?? 0;
                              const contribution =
                                score > 0
                                  ? `${((score / 5) * comp.weight).toFixed(1)} / ${comp.weight}`
                                  : "—";

                              return (
                                <tr key={comp.id}>
                                  <td className="py-3 pl-4 pr-2 text-sm font-medium text-[#1a1a1a]">
                                    {comp.skill || "—"}
                                  </td>
                                  <td className="py-3 px-3 text-xs text-[#6b6b6b] max-w-[180px]">
                                    {comp.rubric || "—"}
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    {score > 0 ? (
                                      <ScoreCircles score={score} />
                                    ) : (
                                      <span className="text-xs text-[#afafaf]">—</span>
                                    )}
                                  </td>
                                  <td className="py-3 pr-4 pl-2 text-right text-xs text-[#6b6b6b] tabular-nums">
                                    {contribution}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>

                      {/* Weighted average bar */}
                      {avg !== null && (
                        <div className="px-4 py-3 border-t border-[#efefef] bg-[#f4f9f8] flex items-center gap-4">
                          <span className="text-xs font-semibold text-[#155e63] shrink-0">
                            Weighted average: {avg.toFixed(0)}%
                          </span>
                          <div className="flex-1 h-2 bg-[#e0eded] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#155e63] rounded-full"
                              style={{ width: `${avg}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Divider between staff members */}
                  <div className="mt-8 border-t border-[#efefef]" />
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-[#efefef] flex items-center justify-between">
          <span className="text-xs text-[#afafaf]">
            {planName} &middot; Competency Report &middot; {year}
          </span>
          <span className="text-xs text-[#afafaf]">Timberline Coffee School</span>
        </footer>
      </div>
    </div>
  );
}
