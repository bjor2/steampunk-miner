/**
 * Which ore a cell holds (docs/standards/feature-slices.md 3.5): the `ores` slice provides the
 * catalogue; with no provider the kernel default names an ore by its cell family and tier. The
 * query is what a cell knows (`family | tierOffset` plus the planet's tier), so the catalogue's
 * own family question stays with the provider.
 *
 * The provider also owns the ore bit index, the bit an ore takes in the codex's `ore` bitsets, and
 * the tag that names it beside the bytes it wrote (#207 TD lock, #219). The kernel default orders by
 * `(tier, cellFamily, grade)`, so metal and crystal of one tier never share a bit.
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
  /** A planet's signature ore (#141); absent in the kernel default. */
  signature?: boolean
}

/** What `CargoAdded` names beside the ore id (#223). */
export interface OreCargoTags {
  family?: string
  signature?: boolean
}

export interface OreTypeProvider {
  id: string
  /** Names the bit index, so bytes it wrote are read back by the index that wrote them. */
  indexTag: string
  oreTypeOf(query: OreQuery): OreType
  /** A whole number >= 0, unique to the ore among every ore the provider answers. */
  bitIndexOf(ore: OreType): number
  /** Every ore the provider can answer, for icon coverage and the codex. */
  catalogue(): readonly OreType[]
}

export const ORE_TYPE_REGISTRY = defineOneProviderRegistry<OreTypeProvider>('oreTypes')

/** The kernel draws ore from its tile look, never an icon (`none`, as the HUD's ok marker). */
const NO_ORE_ICON = 'none'
const NO_REQUIREMENTS: readonly string[] = Object.freeze([])

/** The kernel default index's tag (#219). */
export const KERNEL_ORE_INDEX_TAG = 'kernel.tier-family-grade'

/** Metal and crystal: the cell families an ore of one tier can have. */
const ORE_FAMILIES_PER_TIER = 2

/** The provider's answer, else the kernel default. */
export function oreTypeOf(query: OreQuery): OreType {
  const [provider] = entriesOf(ORE_TYPE_REGISTRY)
  return provider === undefined ? kernelOreTypeOf(query) : provider.oreTypeOf(query)
}

/**
 * A provider's ore names its family and signature flag on `CargoAdded`; the kernel default names
 * neither, so a run with no catalogue logs what it logged before (#223).
 */
export function oreCargoTagsOf(ore: OreType): OreCargoTags {
  const [provider] = entriesOf(ORE_TYPE_REGISTRY)
  return provider === undefined ? {} : { family: ore.family, signature: ore.signature === true }
}

/** The provider's catalogue; empty with no provider. */
export function oreTypeCatalogue(): readonly OreType[] {
  const [provider] = entriesOf(ORE_TYPE_REGISTRY)
  return provider?.catalogue() ?? []
}

/** The provider's bit for this ore, else the kernel default's. */
export function oreBitIndexOf(ore: OreType): number {
  const [provider] = entriesOf(ORE_TYPE_REGISTRY)
  return provider === undefined ? kernelOreBitIndexOf(ore) : provider.bitIndexOf(ore)
}

/** The tag of the index `oreBitIndexOf` answers by. */
export function oreIndexTag(): string {
  const [provider] = entriesOf(ORE_TYPE_REGISTRY)
  return provider?.indexTag ?? KERNEL_ORE_INDEX_TAG
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

/**
 * `tier * 2 + (crystal ? 1 : 0)` (#207 TD lock, Q3): ordered by tier, then cell family, then grade,
 * which is always 0 in the kernel default and so adds no bits.
 */
function kernelOreBitIndexOf({ tier, cellFamily }: OreType): number {
  const familyBit = kernelFamilyName(cellFamily) === 'crystal' ? 1 : 0
  return tier * ORE_FAMILIES_PER_TIER + familyBit
}

/** As the ore look reads a cell: crystal, else metal. */
function kernelFamilyName(cellFamily: ResourceFamily): 'metal' | 'crystal' {
  return cellFamily === RESOURCE_FAMILY.crystal ? 'crystal' : 'metal'
}
