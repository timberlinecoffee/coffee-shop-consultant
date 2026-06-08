// TIM-2517: how many months of ramp losses the opening cash (working capital
// reserve + opening cash buffer) can cover before break-even. Surfaces as a
// banded callout on the Startup tab so founders are warned the moment a plan
// with factory defaults goes insolvent.

export interface OpeningRunwayInput {
  openingCashCents: number;
  rampMonthlyNetIncomeCents: number[];
}

export type RunwayBand = "green" | "yellow" | "red" | "none";

export interface OpeningRunwayResult {
  runwayMonths: number | null;
  band: RunwayBand;
  avgMonthlyLossCents: number;
  lossMonths: number;
}

export function computeOpeningRunway({
  openingCashCents,
  rampMonthlyNetIncomeCents,
}: OpeningRunwayInput): OpeningRunwayResult {
  const losses = rampMonthlyNetIncomeCents
    .filter((n) => n < 0)
    .map((n) => -n);

  if (losses.length === 0) {
    return { runwayMonths: null, band: "none", avgMonthlyLossCents: 0, lossMonths: 0 };
  }

  const avgLoss = losses.reduce((a, b) => a + b, 0) / losses.length;

  if (openingCashCents <= 0) {
    return {
      runwayMonths: 0,
      band: "red",
      avgMonthlyLossCents: avgLoss,
      lossMonths: losses.length,
    };
  }

  const runway = openingCashCents / avgLoss;
  const band: RunwayBand = runway < 1 ? "red" : runway < 3 ? "yellow" : "green";

  return {
    runwayMonths: runway,
    band,
    avgMonthlyLossCents: avgLoss,
    lossMonths: losses.length,
  };
}
