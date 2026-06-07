// TIM-2447: dataset_version helper for the benchmarking extraction pipeline.
//
// Stamps every row inserted by a single run with the same version string so we
// can pin the cohort matcher to a specific dataset cut (and roll back to a
// prior quarter without dropping rows). Format: "YYYY.QN" (e.g. "2026.Q2").
// Quarterly refresh = new version; same-quarter re-runs reuse the version.

export function datasetVersionForDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + 1 // 1..12
  const quarter = Math.ceil(month / 3)
  return `${year}.Q${quarter}`
}
