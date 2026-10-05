/**
 * The platform's programmatic placeholder (#8 "How the platform shows progress", #13: 2 states).
 * The `outpost` is a plain brass-and-iron body standing on the pad beside the dock point; once
 * the platform's `visualState` is `core_drive` a glowing core drive assembly with extra stacks
 * and pipes appears on it and stays. The core bay shows a fill gauge on the body (#8). Both read
 * the authority's state through the replica; the art decides nothing. Metres from the pad's top
 * surface over the dock point, x along the pad.
 */
import type { PlatformVisualState } from '../authority/platformState'
import type { DockSite } from '../world/dockSite'

/** A flat shape of the platform's placeholder; sizes and offsets in metres. */
export interface PartShape {
  shape: 'box' | 'disc'
  /** Width and height; a disc uses the width as its diameter. */
  size: readonly [number, number]
  offset: readonly [number, number]
  colour: string
}

export interface PlatformLook {
  shapes: readonly PartShape[]
  /** The bay gauge's empty frame; the fill grows up from its bottom edge. */
  bayGauge: { offset: readonly [number, number]; size: readonly [number, number] }
}

const IRON = '#3b3631'
const DARK_IRON = '#2a2623'
const BRASS = '#c9a24b'
const COPPER = '#b87333'
const CORE_GLOW = '#ff8a4a'
const CORE_HEART = '#ffe2b0'

const box = (size: PartShape['size'], offset: PartShape['offset'], colour: string): PartShape => ({
  shape: 'box',
  size,
  offset,
  colour,
})
const disc = (diameter: number, offset: PartShape['offset'], colour: string): PartShape => ({
  shape: 'disc',
  size: [diameter, diameter],
  offset,
  colour,
})

/** Left of the dock point, so a docked vehicle stands clear of it. */
const OUTPOST: readonly PartShape[] = [
  box([4.4, 0.4], [-3.4, 0.2], DARK_IRON),
  box([3.8, 2.4], [-3.4, 1.6], IRON),
  box([3.9, 0.13], [-3.4, 2.86], BRASS),
  box([0.3, 1.2], [-4.8, 3.4], IRON),
  box([2.2, 0.16], [-0.9, 2.5], BRASS),
  box([0.1, 1.1], [-0.2, 1.95], BRASS),
]

const CORE_DRIVE: readonly PartShape[] = [
  box([0.3, 1.6], [-4.2, 3.6], IRON),
  box([0.3, 1.4], [-3.7, 3.5], IRON),
  box([2.6, 0.13], [-2.9, 3.0], COPPER),
  box([0.13, 0.9], [-1.65, 2.5], COPPER),
  disc(1.3, [-2.6, 3.7], CORE_GLOW),
  disc(0.6, [-2.6, 3.7], CORE_HEART),
]

const BAY_GAUGE = { offset: [-3.4, 1.4] as const, size: [0.5, 1.6] as const }

export function platformLookOf(visualState: PlatformVisualState): PlatformLook {
  const extras = visualState === 'core_drive' ? CORE_DRIVE : []
  return { shapes: [...OUTPOST, ...extras], bayGauge: BAY_GAUGE }
}

/** The bay gauge's fill, 0 to 1: `bay / coreNeeded`, full past the need, empty with no core. */
export function coreBayFillOf(coreBay: number, coreNeeded: number | null): number {
  if (coreNeeded === null || coreNeeded <= 0) return 0
  return Math.min(coreBay / coreNeeded, 1)
}

/** The platform's origin in world metres: the pad's top surface over the dock point. */
export function platformOriginOf(site: DockSite): { x: number; y: number } {
  return { x: site.dockPoint.tx + 0.5, y: site.padRow + 1 }
}
