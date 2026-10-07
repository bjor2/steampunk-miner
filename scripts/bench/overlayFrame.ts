/**
 * #208 budget: projecting and repositioning the HUD overlay's cards costs at most 0.1 ms per frame
 * with 3 chips. Each timed frame publishes a camera frame driving round planet 1, and three cards
 * on the vehicle and beside it place themselves from `onFrame`, as `OverlayCard` does. The cards
 * are plain objects with the two styles a placement writes, so this times our side of the frame;
 * the browser's own style recalc is not in it. Measured and printed, not gated in CI.
 */
import type { BenchmarkSeries } from '../../src/logging/benchmarkResult'
import type { CameraFrame } from '../../src/systems/render/screenProjection'
import {
  createScreenPlacement,
  placeAtWorldPoint,
  type PlaceableElement,
} from '../../src/ui/projection/screenPlacement'
import { onFrame, publishCameraFrame } from '../../src/ui/projection/worldToScreen'

const BUDGET_P95_MS = 0.1
const CHIPS = 3
const FRAMES = 5000
const PLANET_RADIUS_M = 400
const SURFACE_SPEED_M_PER_S = 12
const FPS = 60

interface Chip {
  card: PlaceableElement
  anchor: { x: number; y: number }
  offsetX: number
}

const frame: CameraFrame = {
  centreX: 0,
  centreY: PLANET_RADIUS_M,
  angle: 0,
  pixelsPerMetre: 66.7,
  widthPixels: 1280,
  heightPixels: 800,
}

function createChips(): Chip[] {
  return Array.from({ length: CHIPS }, (_, index) => ({
    card: { style: { transform: '', visibility: '' } },
    anchor: { x: 0, y: 0 },
    offsetX: index - 1,
  }))
}

function followChips(chips: readonly Chip[]): () => void {
  const unsubscribes = chips.map((chip) => {
    const placement = createScreenPlacement()
    return onFrame(() => placeAtWorldPoint(chip.card, placement, chip.anchor))
  })
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
}

/** Moves the vehicle (and the camera over it) one frame round the planet. */
function driveOneFrame(chips: readonly Chip[], index: number): void {
  const arc = (SURFACE_SPEED_M_PER_S * index) / FPS / PLANET_RADIUS_M
  frame.centreX = PLANET_RADIUS_M * Math.sin(arc)
  frame.centreY = PLANET_RADIUS_M * Math.cos(arc)
  frame.angle = -arc
  for (const chip of chips) {
    chip.anchor.x = frame.centreX + chip.offsetX
    chip.anchor.y = frame.centreY + 1
  }
}

function percentile(times: readonly number[], fraction: number): number {
  const sorted = [...times].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

function frameTimesMs(chips: readonly Chip[]): number[] {
  const times: number[] = []
  for (let index = 0; index < FRAMES; index++) {
    driveOneFrame(chips, index)
    const start = performance.now()
    publishCameraFrame(frame)
    times.push(performance.now() - start)
  }
  return times
}

export function benchOverlayFrame(): BenchmarkSeries {
  const chips = createChips()
  const stopFollowing = followChips(chips)
  frameTimesMs(chips)
  const times = frameTimesMs(chips)
  stopFollowing()
  const p95Ms = percentile(times, 0.95)
  console.log(
    JSON.stringify({
      bench: 'overlayFrame',
      chips: CHIPS,
      frames: times.length,
      p50Ms: Number(percentile(times, 0.5).toFixed(4)),
      p95Ms: Number(p95Ms.toFixed(4)),
      budgetP95Ms: BUDGET_P95_MS,
      isWithinBudget: p95Ms <= BUDGET_P95_MS,
    }),
  )
  return { name: 'overlayFrame', planet: 1, timesMs: times }
}
