// TIM-2483 (F8 in TIM-2454): Gantt timeline window derived from milestone
// offsets. The previous implementation hardcoded a T-90 → Day+30 (120-day)
// span; founders running 180-day pre-opening runways had milestones render
// off-canvas. This module exposes the window as data so the strip stretches
// to fit the actual milestone set.

export const DEFAULT_WINDOW_MIN = -90;
export const DEFAULT_WINDOW_MAX = 30;

export type GanttAnchor = { label: string; offset: number };

// Anchor candidates span a wide range; ganttAnchorsForWindow picks the subset
// that falls within the active window. Day 0 is always present in the list so
// the launch marker shows whenever the window includes it (it always should).
const ANCHOR_CANDIDATES: GanttAnchor[] = [
  { label: "T-365", offset: -365 },
  { label: "T-270", offset: -270 },
  { label: "T-180", offset: -180 },
  { label: "T-120", offset: -120 },
  { label: "T-90", offset: -90 },
  { label: "T-60", offset: -60 },
  { label: "T-30", offset: -30 },
  { label: "T-14", offset: -14 },
  { label: "T-7", offset: -7 },
  { label: "Day 0", offset: 0 },
  { label: "Day+7", offset: 7 },
  { label: "Day+30", offset: 30 },
  { label: "Day+60", offset: 60 },
  { label: "Day+90", offset: 90 },
  { label: "Day+180", offset: 180 },
];

export function computeGanttWindow(
  offsets: ReadonlyArray<number>,
  opts: { defaultMin?: number; defaultMax?: number } = {},
): { min: number; max: number } {
  const dmin = opts.defaultMin ?? DEFAULT_WINDOW_MIN;
  const dmax = opts.defaultMax ?? DEFAULT_WINDOW_MAX;
  const finite = offsets.filter((n) => Number.isFinite(n));
  if (finite.length === 0) return { min: dmin, max: dmax };
  return {
    min: Math.min(dmin, ...finite),
    max: Math.max(dmax, ...finite),
  };
}

export function ganttAnchorsForWindow(min: number, max: number): GanttAnchor[] {
  return ANCHOR_CANDIDATES.filter((a) => a.offset >= min && a.offset <= max);
}

export function ganttPositionFromOffset(
  offsetDays: number,
  min: number,
  max: number,
): number {
  const total = Math.max(1, max - min);
  const pos = ((offsetDays - min) / total) * 100;
  return Math.max(0, Math.min(100, pos));
}
