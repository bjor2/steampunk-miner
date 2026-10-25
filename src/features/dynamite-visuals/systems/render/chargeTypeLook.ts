/**
 * What a charge type looks like (D7, ticket 866): its row of `dynamiteLooks.json`, the fuse sparks
 * its burning sizes throw, the decal its crater leaves and the ring round its live charge; and the
 * two look rows that ride on them, Blast Radius (#869: the rack's sticks and the placed ring grow
 * once per tenfold of the owned level, the #868 HS rule) and Blast Casing (#862: a lined crater's
 * rim in the laid grade's plate colour with its lining's trim, from `casingGradeLook.ts`). Pure
 * rules of the type, the level and the laid casing alone; nothing here reads a store or a clock.
 */
import { MM_PER_METRE } from '../../../../constants/physics'
import {
  chargeSizeCount,
  chargeSizesUpTo,
  chargeTypeOf,
} from '../../../../systems/economy/chargeSizes'
import { casingGradeLookOf, casingTrimOf } from '../../../../systems/render/casingGradeLook'
import {
  DYNAMITE_LOOKS_FILE,
  readDynamiteLookTable,
  type ChargeTypeLookRow,
  type DynamiteLookTable,
  type FuseSparkRow,
} from './dynamiteLookTable'

/** The sparks a burning fuse throws from its lamp, in its type's colour. */
export interface FuseSparks extends FuseSparkRow {
  colour: string
}

/** The casing the host laid round a crater: the planter's grade and lining type at the blast. */
export interface LaidCasing {
  grade: number
  liningType: string
}

/** What a crater is drawn from: its type, the ground it cleared and whether casing was laid. */
export interface CraterBlast {
  chargeType: number
  groundRadiusMm: number
  casingLaid: boolean
}

/** One decal quad of a crater: a part of the crater asset, tinted, this wide. */
export interface CraterDecal {
  partId: string
  tint: string
  diameterM: number
}

/** The ring round a live charge: its line colour and stroke; a cased ring wears the plate tint. */
export interface PlacedRingLook {
  colour: string
  strokeM: number
  /** The laid grade's plate colour over the ring's line, or null for a bare ring. */
  casingTint: string | null
}

/**
 * The crater decals are authored as a 1 m disc whose crater edge sits at this share of its radius,
 * so a decal scaled to the ground radius keeps its rim just outside the clearing.
 */
export const DECAL_RIM_SHARE = 0.84
/** The placed ring's line at level 0, metres; it grows with the Blast Radius band. */
export const RING_STROKE_M = 0.09

/** The charge types of the kernel ladder, in order: the lines the look rows must cover. */
export function chargeTypes(): number[] {
  return [...new Set(chargeSizesUpTo(chargeSizeCount()).map(chargeTypeOf))]
}

export const DYNAMITE_LOOKS: DynamiteLookTable = readDynamiteLookTable(
  DYNAMITE_LOOKS_FILE,
  chargeTypes().length,
)

export function chargeTypeLookOf(
  type: number,
  table: DynamiteLookTable = DYNAMITE_LOOKS,
): ChargeTypeLookRow {
  const row = table.types.find((candidate) => candidate.type === type)
  if (row === undefined) throw new RangeError(`no look row for charge type ${type}`)
  return row
}

/** The look of a size's type. */
export function chargeLookOfSize(
  size: number,
  table: DynamiteLookTable = DYNAMITE_LOOKS,
): ChargeTypeLookRow {
  return chargeTypeLookOf(chargeTypeOf(size), table)
}

/**
 * The Blast Radius band of an owned level: 0 at level 0, then one more for every tenfold of the
 * level (1 at 1 to 9, 2 at 10 to 99, ...), by integer division alone (#868 HS; #809's band rule).
 */
export function radiusBandOf(level: number): number {
  let band = 0
  for (let left = Math.floor(level); left >= 1; left = Math.floor(left / 10)) band++
  return band
}

/** How much the rack's sticks and the ring's stroke grow at a level: 1 at band 0, to the cap. */
export function radiusGrowthOf(level: number, table: DynamiteLookTable = DYNAMITE_LOOKS): number {
  const { growPerBand, growMax } = table.radiusBands
  return Math.min(growMax, 1 + radiusBandOf(level) * growPerBand)
}

export function fuseSparksOf(type: number, table: DynamiteLookTable = DYNAMITE_LOOKS): FuseSparks {
  return { ...table.fuse, colour: chargeTypeLookOf(type, table).spark }
}

/**
 * The decals a blast leaves: its type's crater in its soot, or with casing laid the lined rim in
 * the grade's plate colour under the lining's trim (the #830 trim colour, else the plate's groove).
 */
export function craterLookOf(
  blast: CraterBlast,
  casing: LaidCasing | null,
  table: DynamiteLookTable = DYNAMITE_LOOKS,
): CraterDecal[] {
  const diameterM = decalDiameterMOf(blast.groundRadiusMm)
  if (blast.casingLaid && casing !== null) return casedDecalsOf(casing, diameterM, table)
  const type = chargeTypeLookOf(blast.chargeType, table)
  return [{ partId: type.crater, tint: type.soot, diameterM }]
}

export function placedRingLookOf(
  type: number,
  radiusLevel: number,
  casing: LaidCasing | null,
  table: DynamiteLookTable = DYNAMITE_LOOKS,
): PlacedRingLook {
  return {
    colour: chargeTypeLookOf(type, table).ring,
    strokeM: RING_STROKE_M * radiusGrowthOf(radiusLevel, table),
    casingTint: casing === null ? null : casingGradeLookOf(casing.grade).plate.colour,
  }
}

/** The decal disc scaled so its authored crater edge sits on the ground radius. */
export function decalDiameterMOf(groundRadiusMm: number): number {
  return (2 * groundRadiusMm) / MM_PER_METRE / DECAL_RIM_SHARE
}

function casedDecalsOf(
  casing: LaidCasing,
  diameterM: number,
  table: DynamiteLookTable,
): CraterDecal[] {
  const { plate } = casingGradeLookOf(casing.grade)
  const trim = casingTrimOf(casing.liningType)
  return [
    { partId: table.casing.rimPart, tint: plate.colour, diameterM },
    { partId: table.casing.trimPart, tint: trim.colour ?? plate.groove, diameterM },
  ]
}
