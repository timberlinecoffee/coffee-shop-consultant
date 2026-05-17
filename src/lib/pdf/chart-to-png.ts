import { ChartJSNodeCanvas } from "chartjs-node-canvas"
import type { ChartConfiguration } from "chart.js"

let _canvas: ChartJSNodeCanvas | null = null

function getCanvas(width: number, height: number): ChartJSNodeCanvas {
  if (!_canvas) {
    _canvas = new ChartJSNodeCanvas({ width, height, backgroundColour: "white" })
  }
  return _canvas
}

export type ChartSpec = {
  config: ChartConfiguration
  width?: number
  height?: number
}

export async function chartToPng({ config, width = 600, height = 360 }: ChartSpec): Promise<Buffer> {
  const canvas = getCanvas(width, height)
  return canvas.renderToBuffer(config)
}
