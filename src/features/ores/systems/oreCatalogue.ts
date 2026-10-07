/**
 * The ore catalogue (#140 "Ore identity", reconciled with #141 and #151): an ore type is a
 * `(family, tier)` pair. Family is look and identity only; tier is the one economic number, so value
 * and hardness read the tier alone (`oreSalePrice`, `oreHardness` in the kernel's oreEconomy).
 *
 *   t(p, b, lead) = 3(p-1) + b + lead        id `<family>_t<t>`        name `<gradeName> <familyName>`
 *   variant = (t-1) mod 4                    echo = t < 126 ? 0 : floor((t-126)/25) + 1
 *
 * Grades are #151's (`oreGrades` [4, 12, 30, 70]: Raw, Lustrous, Crystal, Lumen, Aether), read
 * from the kernel's `oreGrade`, the one reader of those thresholds. Vertical: the tier axis, the
 * grades and the echo. Both: the catalogue as a new thing to see.
 */
import { oreTier } from '../../../systems/economy/oreEconomy'
import { oreGradeNameOf, oreGradeOf } from '../../../systems/render/oreGrade'
import { ORE_ROWS, type LeadWeights, type OreFamily, type OreRows } from './oreRows'

export interface CatalogueOre {
  /** `<family>_t<tier>`. */
  id: string
  /** `<gradeName> <familyName>`; the UI shows the tier beside it ("Tier 12 Crystal Pitchglow"). */
  name: string
  family: string
  tier: number
  /** #151 grade, 1 (Raw) to 5 (Aether). */
  grade: number
  /** The family's look slot, 0 to `variantsPerFamily - 1`; neighbouring tiers never share one. */
  variant: number
  /** 0 through the campaign; past it the strength input #151's look keeps climbing on. */
  echo: number
}

const FIRST_TIER = 1

/** The type of a family at a tier: its id, name and the look inputs #151 reads. */
export function oreTypeOf(familyId: string, tier: number, rows: OreRows = ORE_ROWS): CatalogueOre {
  const family = familyOfId(familyId, rows)
  assertTier(tier)
  return {
    id: `${family.id}_t${tier}`,
    name: `${oreGradeNameOf(tier)} ${family.name}`,
    family: family.id,
    tier,
    grade: gradeOf(tier),
    variant: variantOf(tier, rows),
    echo: echoOf(tier, rows),
  }
}

/** `t(p, b, lead)`: band `b`'s tier on planet `p`, plus the cell's rarity lead (#140). */
export function oreTierOf(planetIndex: number, band: number, lead: number): number {
  return oreTier(planetIndex, band) + lead
}

export function gradeOf(tier: number): number {
  return oreGradeOf(tier)
}

export function variantOf(tier: number, rows: OreRows = ORE_ROWS): number {
  return (tier - FIRST_TIER) % rows.catalogue.variantsPerFamily
}

export function echoOf(tier: number, rows: OreRows = ORE_ROWS): number {
  const { echoFrom, echoEvery } = rows.catalogue
  return tier < echoFrom ? 0 : Math.floor((tier - echoFrom) / echoEvery) + 1
}

/** The basis points of band `b`'s ore that roll a +1 or a +2 lead (#140 `leadWeights`). */
export function leadWeights(band: number, rows: OreRows = ORE_ROWS): LeadWeights {
  const weights = rows.leadWeightsByBand[band - 1]
  if (weights === undefined) throw new RangeError(`band must be 1 to 5, got ${band}`)
  return weights
}

/** Every family, in cell-code order. */
export function oreFamilies(rows: OreRows = ORE_ROWS): readonly OreFamily[] {
  return rows.families
}

/** The family a cell's 4-bit family field names; null for `none` or an unused code. */
export function familyOfCellCode(cellCode: number, rows: OreRows = ORE_ROWS): OreFamily | null {
  return rows.families.find((family) => family.cellCode === cellCode) ?? null
}

function familyOfId(familyId: string, rows: OreRows): OreFamily {
  const family = rows.families.find((row) => row.id === familyId)
  if (family === undefined) throw new RangeError(`no ore family "${familyId}" in the catalogue`)
  return family
}

function assertTier(tier: number): void {
  if (!Number.isSafeInteger(tier) || tier < FIRST_TIER) {
    throw new RangeError(`tier must be a safe integer from 1, got ${tier}`)
  }
}
