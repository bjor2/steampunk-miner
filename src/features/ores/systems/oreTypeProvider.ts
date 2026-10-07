/**
 * The catalogue as the kernel's one `oreTypes` provider (feature-slices.md 3.5): a cell asks with
 * its tier and its 4-bit family code, and gets the catalogue type of that family at that tier.
 * `catalogue()` lists every type sold ore can be in the campaign, P1 band 1 to P40 band 5 with a
 * +2 lead (t 1 to 124), for icon coverage and the codex; endless tiers are answered, not listed.
 *
 * Icons are generated per tier (`icon-ore-<family>-t<tier>`), and the generator draws metal and
 * crystal; the other ten families take its `mixed` nugget until ore-visuals ships their glyphs.
 *
 * The codex bit index (#207, #219) is tier-major with a stride of every code the cell's 4-bit family
 * field can hold, not just today's 12 families, so an appended family never moves a stored bit and
 * the index tag stays. Signatures are #141's (planet-mix), so no type here sets `signature`.
 */
import { CAMPAIGN_LAST_PLANET } from '../../../constants/balance'
import { oreIconIdOf, type OreIconFamily } from '../../../systems/art/icons/oreIcon'
import type { OreQuery, OreType, OreTypeProvider } from '../../../systems/registries/oreTypes'
import { BAND_COUNT } from '../../../systems/world/planetGeometry'
import type { ResourceFamily } from '../../../systems/world/worldCell'
import { familyOfCellCode, oreFamilies, oreFamilyNamed, oreTierOf, oreTypeOf } from './oreCatalogue'
import { MAX_FAMILY_CODE, type OreFamily } from './oreRows'

export const ORE_TYPE_PROVIDER_ID = 'ores.catalogue'
export const ORE_INDEX_TAG = 'ores.tier-family'

/** #140: the largest lead the catalogue rolls. */
const MAX_LEAD = 2
const ICON_FAMILIES: readonly string[] = ['metal', 'crystal']
const NO_REQUIREMENTS: readonly string[] = Object.freeze([])

export const oreTypeProvider: OreTypeProvider = {
  id: ORE_TYPE_PROVIDER_ID,
  indexTag: ORE_INDEX_TAG,
  oreTypeOf: kernelOreTypeOf,
  bitIndexOf: bitIndexOfOre,
  catalogue: campaignCatalogue,
}

/** The highest tier campaign ore reaches: P40 band 5 plus the +2 lead. */
export function lastCampaignOreTier(): number {
  return oreTierOf(CAMPAIGN_LAST_PLANET, BAND_COUNT, MAX_LEAD)
}

function kernelOreTypeOf({ tier, cellFamily }: OreQuery): OreType {
  return oreTypeOfFamily(familyOfCell(cellFamily), cellFamily, tier)
}

/** A cell family code with no row (`none`) wears the first family, as the kernel look does. */
function familyOfCell(cellFamily: ResourceFamily): OreFamily {
  return familyOfCellCode(cellFamily) ?? oreFamilies()[0]
}

/** `(tier - 1) * 15 + (family code - 1)`: deeper ores take higher bits. */
function bitIndexOfOre({ family, tier }: OreType): number {
  return (tier - 1) * MAX_FAMILY_CODE + oreFamilyNamed(family).cellCode - 1
}

function oreTypeOfFamily(family: OreFamily, cellFamily: number, tier: number): OreType {
  const ore = oreTypeOf(family.id, tier)
  return {
    id: ore.id,
    name: ore.name,
    family: ore.family,
    cellFamily: cellFamily as ResourceFamily,
    tier,
    grade: ore.grade,
    iconId: oreIconIdOf(iconFamilyOf(family.id), tier),
    requires: NO_REQUIREMENTS,
  }
}

function iconFamilyOf(familyId: string): OreIconFamily {
  return ICON_FAMILIES.includes(familyId) ? (familyId as OreIconFamily) : 'mixed'
}

/** Built on first ask, so loading the slice costs nothing. */
let campaign: readonly OreType[] | null = null

function campaignCatalogue(): readonly OreType[] {
  campaign ??= Object.freeze(oreFamilies().flatMap(campaignTypesOf))
  return campaign
}

function campaignTypesOf(family: OreFamily): OreType[] {
  return Array.from({ length: lastCampaignOreTier() }, (_, at) =>
    oreTypeOfFamily(family, family.cellCode, at + 1),
  )
}
