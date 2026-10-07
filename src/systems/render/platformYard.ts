/**
 * The yard between the two shop buildings (#170 "Look": the hub becomes a short, lamp-lit yard with
 * signposts; it was the hub of #8, #13 and #37). A lamp post at each end, a signpost pointing to
 * the Assay & Exchange on the left and the Engineering Works on the right, told apart by shape as
 * well as colour (a coin, a cross; #13), and the core bay's fill gauge on its plinth (#8). Once the
 * platform's `visualState` is `core_drive` a glowing core drive assembly stands in the yard and
 * stays (#13, #8 "How the platform shows progress"). Lit by its own lamp (#38, #48). All of it
 * reads the authority's state through the replica; the art decides nothing. Metres from the pad's
 * top surface at the dock point, the middle of the yard (columns -2 to +1, x from -2 to 2).
 */
import type { PlatformVisualState } from '../authority/platformState'
import type { DockSite } from '../world/dockSite'

/** A flat shape of the yard; sizes and offsets in metres. */
export interface PartShape {
  shape: 'box' | 'disc'
  /** Width and height; a disc uses the width as its diameter. */
  size: readonly [number, number]
  offset: readonly [number, number]
  colour: string
  /** Glows by itself (emissive), so it reads in the dark and feeds the bloom (#38, #48). */
  isGlowing?: boolean
}

/** A light on the platform (#48: the same material language as the vehicle, lit by its lamps). */
export interface PlatformLamp {
  id: string
  offset: readonly [number, number]
  colour: string
  rangeM: number
  strength: number
}

export interface PlatformLook {
  shapes: readonly PartShape[]
  /** Its point-light sources; at most 4 lights shine in view (#38), so a few, never one per part. */
  lamps: readonly PlatformLamp[]
  /** The bay gauge's empty frame; the fill grows up from its bottom edge. */
  bayGauge: { offset: readonly [number, number]; size: readonly [number, number] }
}

const IRON = '#3b3631'
const DARK_IRON = '#2a2623'
const BRASS = '#c9a24b'
const COPPER = '#b87333'
const LAMP_GLASS = '#ffd9a0'
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

/** Placeholders, tuned by eye: the posts stand at the yard's ends, clear of both buildings. */
const LAMP_POST_X = 1.7
const LAMP_TOP = 3.2

const LAMP_POSTS: readonly PartShape[] = [-LAMP_POST_X, LAMP_POST_X].flatMap((x) => [
  box([0.13, LAMP_TOP], [x, LAMP_TOP / 2], IRON),
  box([0.42, 0.13], [x, LAMP_TOP], BRASS),
  { ...disc(0.26, [x, LAMP_TOP - 0.2], LAMP_GLASS), isGlowing: true },
])

/** One post, a copper coin board towards the Exchange and a teal cross board towards the Works. */
const SIGNPOST: readonly PartShape[] = [
  box([0.13, 2.7], [0, 1.35], IRON),
  box([1.2, 0.42], [-0.62, 2.35], COPPER),
  disc(0.3, [-0.92, 2.35], BRASS),
  box([1.2, 0.42], [0.62, 1.8], BAY_TEAL),
  box([0.34, 0.1], [0.92, 1.8], BRASS),
  box([0.1, 0.34], [0.92, 1.8], BRASS),
]

const GAUGE_PLINTH: readonly PartShape[] = [box([0.7, 0.3], [-1.05, 0.15], DARK_IRON)]

const CORE_DRIVE: readonly PartShape[] = [
  box([0.9, 0.48], [1.0, 0.24], DARK_IRON),
  box([0.22, 1.5], [0.7, 1.25], IRON),
  box([0.13, 0.9], [1.3, 0.95], COPPER),
  { ...disc(0.8, [1.0, 1.5], CORE_GLOW), isGlowing: true },
  { ...disc(0.38, [1.0, 1.5], CORE_HEART), isGlowing: true },
]

const YARD_LAMPS: readonly PlatformLamp[] = [
  { id: 'platform-lamp', offset: [0, LAMP_TOP], colour: LAMP_GLASS, rangeM: 6, strength: 0.4 },
]
const CORE_DRIVE_LAMPS: readonly PlatformLamp[] = [
  { id: 'core-drive-glow', offset: [1.0, 1.5], colour: CORE_GLOW, rangeM: 5, strength: 0.8 },
]

const BAY_GAUGE = { offset: [-1.05, 1.0] as const, size: [0.4, 1.2] as const }

export function platformYardLookOf(visualState: PlatformVisualState): PlatformLook {
  const isCoreDrive = visualState === 'core_drive'
  return {
    shapes: [...LAMP_POSTS, ...SIGNPOST, ...GAUGE_PLINTH, ...(isCoreDrive ? CORE_DRIVE : [])],
    lamps: [...YARD_LAMPS, ...(isCoreDrive ? CORE_DRIVE_LAMPS : [])],
    bayGauge: BAY_GAUGE,
  }
}

/** The bay gauge's fill, 0 to 1: `bay / coreNeeded`, full past the need, empty with no core. */
export function coreBayFillOf(coreBay: number, coreNeeded: number | null): number {
  if (coreNeeded === null || coreNeeded <= 0) return 0
  return Math.min(coreBay / coreNeeded, 1)
}

/** The platform's origin in world metres: the pad's top surface at the dock point, mid-yard. */
export function platformOriginOf(site: DockSite): { x: number; y: number } {
  return { x: site.dockPoint.tx, y: site.padRow + 1 }
}
