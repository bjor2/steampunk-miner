/**
 * The platform's programmatic placeholder (#8 "How the platform shows progress", #13: 2 states;
 * #37: a hub with two bays). The `outpost` is a plain brass-and-iron hub standing on the middle of
 * the pad, between the Sell bay and the Upgrade bay; once the platform's `visualState` is
 * `core_drive` a glowing core drive assembly with extra stacks and pipes appears on the hub and
 * stays. The core bay shows a fill gauge on the hub (#8). Each bay has a sign on a post above its
 * pad, told apart by shape as well as colour (#13): a coin on the Sell bay's, a cross on the
 * Upgrade bay's. All of it reads the authority's state through the replica; the art decides
 * nothing. Metres from the pad's top surface at its middle, x along the pad.
 */
import type { PlatformVisualState } from '../authority/platformState'
import { bayCentreColumnOf } from '../world/dockBays'
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
const BAY_TEAL = '#3f9a94'

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

/** On the hub between the bays, so a vehicle docked at either stands clear of it. */
const OUTPOST: readonly PartShape[] = [
  box([4.4, 0.4], [0, 0.2], DARK_IRON),
  box([3.8, 2.4], [0, 1.6], IRON),
  box([3.9, 0.13], [0, 2.86], BRASS),
  box([0.3, 1.2], [-1.4, 3.4], IRON),
]

const CORE_DRIVE: readonly PartShape[] = [
  box([0.3, 1.6], [-0.8, 3.6], IRON),
  box([0.3, 1.4], [-0.3, 3.5], IRON),
  box([2.6, 0.13], [0.5, 3.0], COPPER),
  box([0.13, 0.9], [1.75, 2.5], COPPER),
  disc(1.3, [0.8, 3.7], CORE_GLOW),
  disc(0.6, [0.8, 3.7], CORE_HEART),
]

const BAY_GAUGE = { offset: [0, 1.4] as const, size: [0.5, 1.6] as const }

/** A bay's sign stands this high over its pad, on a post at the pad's outer edge. */
const SIGN_HEIGHT = 3.4
const POST_FROM_CENTRE = 1.8

export function platformLookOf(visualState: PlatformVisualState, site: DockSite): PlatformLook {
  const extras = visualState === 'core_drive' ? CORE_DRIVE : []
  return { shapes: [...OUTPOST, ...extras, ...baySignsOf(site)], bayGauge: BAY_GAUGE }
}

function baySignsOf(site: DockSite): PartShape[] {
  const sell = bayCentreColumnOf(site, 'sell') - padMiddleOf(site)
  const upgrade = bayCentreColumnOf(site, 'upgrade') - padMiddleOf(site)
  return [
    box([0.13, SIGN_HEIGHT], [sell - POST_FROM_CENTRE, SIGN_HEIGHT / 2], IRON),
    box([2.6, 0.6], [sell, SIGN_HEIGHT], COPPER),
    disc(0.42, [sell, SIGN_HEIGHT], BRASS),
    box([0.13, SIGN_HEIGHT], [upgrade + POST_FROM_CENTRE, SIGN_HEIGHT / 2], IRON),
    box([2.6, 0.6], [upgrade, SIGN_HEIGHT], BAY_TEAL),
    box([0.5, 0.13], [upgrade, SIGN_HEIGHT], BRASS),
    box([0.13, 0.5], [upgrade, SIGN_HEIGHT], BRASS),
  ]
}

function padMiddleOf(site: DockSite): number {
  return (site.firstColumn + site.lastColumn + 1) / 2
}

/** The bay gauge's fill, 0 to 1: `bay / coreNeeded`, full past the need, empty with no core. */
export function coreBayFillOf(coreBay: number, coreNeeded: number | null): number {
  if (coreNeeded === null || coreNeeded <= 0) return 0
  return Math.min(coreBay / coreNeeded, 1)
}

/** The platform's origin in world metres: the pad's top surface at its middle, on the hub. */
export function platformOriginOf(site: DockSite): { x: number; y: number } {
  return { x: padMiddleOf(site), y: site.padRow + 1 }
}
