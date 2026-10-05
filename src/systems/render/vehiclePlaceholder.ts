/**
 * The programmatic placeholder for the hand-authored vehicle (#13: brass, copper and iron, built
 * from about 8 layered parts). Each part has 3 variants, one per visual tier, picked by its
 * `tierSource` (#7 `VehicleDef.parts`; `'total'`, the tier of the summed levels, is the only
 * source in the slice, and a per-track source can join later without a schema change). Tier 2
 * adds side armour plates and a second stack; tier 3 the bore-collar drill, a second boiler and a
 * second lamp (#7 "Visual tiers and horizontals"). Flat shapes only, until the commissioned art
 * lands. Sizes and offsets are metres in the body's frame; the art may overhang the 0.9 m
 * collider but never sizes it (#7): physics reads `VEHICLE_COLLIDER_SIZE`, never this file.
 */

export type TierSource = 'total'

export interface PartShape {
  shape: 'box' | 'disc'
  /** Width and height; a disc uses the width as its diameter. */
  size: readonly [number, number]
  offset: readonly [number, number]
  colour: string
}

/** A part at one tier: zero or more shapes (an absent armour plate is an empty variant). */
export type PartVariant = readonly PartShape[]

export interface VehiclePartDef {
  id: string
  /** Higher layers draw over lower ones. */
  layer: number
  tierSource: TierSource
  /** Variants for visual tiers 1, 2 and 3. */
  variants: readonly [PartVariant, PartVariant, PartVariant]
}

/** One shape to draw: its part and layer, for a stable key and the draw order. */
export interface DrawnShape extends PartShape {
  key: string
  layer: number
}

/** The drill head (#7: the head swivels to 4 facings) at one tier: its plate and its collar. */
export interface DrillHeadLook {
  size: number
  colour: string
  /** The bore collar behind the bit, 0 for none. */
  collarSize: number
}

const IRON = '#3b3631'
const DARK_IRON = '#2a2623'
const COPPER = '#b87333'
const BRASS = '#c9a24b'
const DARK_BRASS = '#8a6a2f'
const STEEL = '#9aa0a6'
const PARCHMENT = '#e9dcc0'
const LAMP = '#ffd9a0'

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

const WHEELS_AT = [-0.32, 0, 0.32]

export const VEHICLE_PARTS: readonly VehiclePartDef[] = [
  partOf('tracks', 0, [
    [box([1, 0.2], [0, -0.36], IRON)],
    [box([1, 0.2], [0, -0.36], IRON), box([1.04, 0.05], [0, -0.25], DARK_IRON)],
    [box([1.08, 0.24], [0, -0.36], IRON), box([1.1, 0.06], [0, -0.23], DARK_BRASS)],
  ]),
  partOf('wheels', 1, [
    WHEELS_AT.map((x) => disc(0.24, [x, -0.36], DARK_IRON)),
    WHEELS_AT.flatMap((x) => [disc(0.24, [x, -0.36], DARK_IRON), disc(0.08, [x, -0.36], BRASS)]),
    WHEELS_AT.flatMap((x) => [disc(0.26, [x, -0.36], DARK_IRON), disc(0.1, [x, -0.36], BRASS)]),
  ]),
  partOf('chassis', 2, [
    [box([0.9, 0.42], [0, -0.08], COPPER)],
    [box([0.9, 0.42], [0, -0.08], COPPER), box([0.9, 0.04], [0, -0.2], DARK_BRASS)],
    [box([0.94, 0.46], [0, -0.08], COPPER), box([0.94, 0.05], [0, -0.22], BRASS)],
  ]),
  partOf('stacks', 2, [
    [box([0.1, 0.3], [-0.32, 0.38], IRON)],
    [box([0.1, 0.3], [-0.32, 0.38], IRON), box([0.1, 0.24], [-0.16, 0.44], IRON)],
    [box([0.12, 0.36], [-0.32, 0.4], IRON), box([0.12, 0.3], [-0.16, 0.46], IRON)],
  ]),
  partOf('boiler', 3, [
    [disc(0.42, [-0.13, 0.2], BRASS)],
    [disc(0.42, [-0.13, 0.2], BRASS), disc(0.13, [0.06, 0.24], PARCHMENT)],
    [disc(0.42, [-0.13, 0.2], BRASS), disc(0.3, [0.16, 0.22], BRASS)],
  ]),
  partOf('cab', 3, [
    [box([0.22, 0.16], [0.26, 0.04], PARCHMENT)],
    [box([0.22, 0.16], [0.26, 0.04], PARCHMENT), box([0.32, 0.06], [0.18, -0.22], STEEL)],
    [box([0.22, 0.16], [0.26, 0.04], PARCHMENT), box([0.32, 0.06], [0.18, -0.22], STEEL)],
  ]),
  partOf('lamp', 4, [
    [disc(0.1, [0.4, 0.12], LAMP)],
    [disc(0.12, [0.4, 0.12], LAMP)],
    [disc(0.12, [0.4, 0.12], LAMP), disc(0.1, [-0.4, 0.12], LAMP)],
  ]),
  partOf('armour', 5, [
    [],
    [box([0.1, 0.38], [0.46, -0.08], DARK_BRASS), box([0.1, 0.38], [-0.46, -0.08], DARK_BRASS)],
    [
      box([0.1, 0.4], [0.48, -0.08], DARK_BRASS),
      box([0.1, 0.4], [-0.48, -0.08], DARK_BRASS),
      box([0.98, 0.08], [0, 0.14], DARK_BRASS),
    ],
  ]),
]

const DRILL_HEAD_LOOKS: readonly [DrillHeadLook, DrillHeadLook, DrillHeadLook] = [
  { size: 0.35, colour: '#5b3a1e', collarSize: 0 },
  { size: 0.38, colour: '#6b4424', collarSize: 0 },
  { size: 0.4, colour: '#7a7f86', collarSize: 0.5 },
]

/** The tier a part draws at: its source's tier, within the 3 variants it has. */
export function tierOfPart(part: VehiclePartDef, visualTier: number): number {
  return clampTier(part.tierSource === 'total' ? visualTier : 1)
}

/** The shapes a vehicle of this visual tier shows, lowest layer first. */
export function vehicleShapesForTier(visualTier: number): DrawnShape[] {
  return VEHICLE_PARTS.flatMap((part) => shapesOfPart(part, tierOfPart(part, visualTier))).sort(
    (a, b) => a.layer - b.layer,
  )
}

export function drillHeadLookOf(visualTier: number): DrillHeadLook {
  return DRILL_HEAD_LOOKS[clampTier(visualTier) - 1]
}

function shapesOfPart(part: VehiclePartDef, tier: number): DrawnShape[] {
  return part.variants[tier - 1].map((shape, at) => ({
    ...shape,
    key: `${part.id}.${at}`,
    layer: part.layer,
  }))
}

function clampTier(tier: number): number {
  return Math.min(Math.max(1, Math.floor(tier)), 3)
}

function partOf(
  id: string,
  layer: number,
  variants: VehiclePartDef['variants'],
  tierSource: TierSource = 'total',
): VehiclePartDef {
  return { id, layer, tierSource, variants }
}
