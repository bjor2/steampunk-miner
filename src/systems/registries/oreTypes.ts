/**
 * Which ore a cell holds (docs/standards/feature-slices.md 3.5): the `ores` slice provides the
 * catalogue; with no provider the kernel default names an ore by its cell family and tier. The
 * query is what a cell knows (`family | tierOffset` plus the planet's tier), so the catalogue's
 * own family question stays with the provider.
 */
import { RESOURCE_FAMILY, type ResourceFamily } from '../world/worldCell'
import { defineOneProviderRegistry, entriesOf } from './seal'

export interface OreQuery {
  tier: number
  cellFamily: ResourceFamily
}

export interface OreType {
  /** Kernel default: `kernel.<family>.t<tier>`. */
  id: string
  name: string
  /** The catalogue family name (#140); kernel default: `metal` or `crystal`. */
  family: string
  cellFamily: ResourceFamily
  tier: number
  /** Integer; 0 in the kernel default. */
  grade: number
  iconId: string
  /** #140 `requires`, read only by mining-gates; empty in the kernel default. */
  requires: readonly string[]
}

export interface OreTypeProvider {
  id: string
  oreTypeOf(query: OreQuery): OreType
  /** Every ore the provider can answer, for icon coverage and the codex. */
  catalogue(): readonly OreType[]
}

export const ORE_TYPE_REGISTRY = defineOneProviderRegistry<OreTypeProvider>('oreTypes')

/** The kernel draws ore from its tile look, never an icon (`none`, as the HUD's ok marker). */
const NO_ORE_ICON = 'none'
const NO_REQUIREMENTS: readonly string[] = Object.freeze([])

/** The provider's answer, else the kernel default. */
export function oreTypeOf(query: OreQuery): OreType {
  const [provider] = entriesOf(ORE_TYPE_REGISTRY)
  return provider === undefined ? kernelOreTypeOf(query) : provider.oreTypeOf(query)
}

/** The provider's catalogue; empty with no provider. */
export function oreTypeCatalogue(): readonly OreType[] {
  const [provider] = entriesOf(ORE_TYPE_REGISTRY)
  return provider?.catalogue() ?? []
}

function kernelOreTypeOf({ tier, cellFamily }: OreQuery): OreType {
  const family = kernelFamilyName(cellFamily)
  return {
    id: `kernel.${family}.t${tier}`,
    name: `${family === 'crystal' ? 'Crystal' : 'Metal'} ore, tier ${tier}`,
    family,
    cellFamily,
    tier,
    grade: 0,
    iconId: NO_ORE_ICON,
    requires: NO_REQUIREMENTS,
  }
}

/** As the ore look reads a cell: crystal, else metal. */
function kernelFamilyName(cellFamily: ResourceFamily): 'metal' | 'crystal' {
  return cellFamily === RESOURCE_FAMILY.crystal ? 'crystal' : 'metal'
}
