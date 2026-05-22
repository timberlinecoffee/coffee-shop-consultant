// chartjs-node-canvas requires native Cairo/Pango bindings unavailable on Vercel.
// Chart sections in PDFs fall back to text summaries (see financials.tsx renderCharts).

export type ChartSpec = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any
  width?: number
  height?: number
}

export async function chartToPng(_spec: ChartSpec): Promise<Buffer> {
  throw new Error("Server-side chart rendering is not supported in this environment")
}
