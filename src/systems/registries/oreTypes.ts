/**
 * Which ore a cell holds (docs/standards/feature-slices.md 3.5): the `ores` slice provides the
 * catalogue; with no provider the kernel default names an ore by its cell family and tier. The
 * query is what a cell knows (`family | tierOffset` plus the planet's tier), so the catalogue's
 * own family question stays with the provider.
 *
 * The provider also owns the ore bit index, the bit an ore takes in the codex's `ore` bitsets, and
 * the tag that names it beside the bytes it wrote (#207 TD lock, #219). The kernel default orders by
 * `(tier, cellFamily, grade)`, so metal and crystal of one tier never share a bit.
 *
 * Signature tags fold over the provider's answer (#232, GD lock on #147): a planet's signature
 * (#141) is a pure function of an ore's family and tier that only the planet mix knows, so the one
 * provider never has to. A tagged ore is `signature` and sells `signatureValueLead` tiers up
 * (`saleTier`); its tier, and so its id, bit and look, stay the provider's.
 */
import { signatureSaleTier } from '../economy/oreEconomy'
import { RESOURCE_FAMILY, type ResourceFamily } from '../world/worldCell'
import { defineOneProviderRegistry, defineRegistry, entriesOf } from './seal'

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
  /** A planet's signature ore (#141); set only by a signature tag. */
  signature?: boolean
  /**
   * The tier the ore's cargo sells at (#232): set with `signature`, `tier + signatureValueLead`;
   * absent, the ore sells at `tier`. Hardness and dig time never read it.
   */
  saleTier?: number
}

/** Folded over every provider answer in id order; any tag that answers yes makes it a signature. */
export interface OreSignatureTag {
  id: string
  isSignature(ore: OreType): boolean
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

export const ORE_SIGNATURE_REGISTRY = defineRegistry<OreSignatureTag>('oreSignatures')

/** The kernel draws ore from its tile look, never an icon (`none`, as the HUD's ok marker). */
const NO_ORE_ICON = 'none'
const NO_REQUIREMENTS: readonly string[] = Object.freeze([])

/** The kernel default index's tag (#219). */
export const KERNEL_ORE_INDEX_TAG = 'kernel.tier-family-grade'

/** Metal and crystal: the cell families an ore of one tier can have. */
const ORE_FAMILIES_PER_TIER = 2

/** The provider's answer, else the kernel default, with the signature tags folded over it. */
export function oreTypeOf(query: OreQuery): OreType {
  return withSignatureTag(providedOreTypeOf(query))
}

/** Whether any slice registered a signature tag: with none, no ore is a signature. */
export function hasOreSignatureTags(): boolean {
  return entriesOf(ORE_SIGNATURE_REGISTRY).length > 0
}

/** The tier the ore's cargo is kept and sold at: its `saleTier`, else its own (#232). */
export function saleTierOf(ore: OreType): number {
  return ore.saleTier ?? ore.tier
}

/**
 * A provider's ore names its family and signature flag on `CargoAdded`; the kernel default names
 * neither, so a run with no catalogue logs what it logged before (#223).
 */
export function oreCargoTagsOf(ore: OreType): OreCargoTags {
  const [provider] = entriesOf(ORE_TYPE_REGISTRY)
  return provider === undefined ? {} : { family: ore.family, signature: ore.signature === true }
}

/** The provider's catalogue, tagged as `oreTypeOf` tags it; empty with no provider. */
export function oreTypeCatalogue(): readonly OreType[] {
  const [provider] = entriesOf(ORE_TYPE_REGISTRY)
  const catalogue = provider?.catalogue() ?? []
  return hasOreSignatureTags() ? catalogue.map(withSignatureTag) : catalogue
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

function providedOreTypeOf(query: OreQuery): OreType {
  const [provider] = entriesOf(ORE_TYPE_REGISTRY)
  return provider === undefined ? kernelOreTypeOf(query) : provider.oreTypeOf(query)
}

/** The ore itself when no tag claims it, so an untagged run sees the provider's own object. */
function withSignatureTag(ore: OreType): OreType {
  if (!isClaimedAsSignature(ore)) return ore
  return { ...ore, signature: true, saleTier: signatureSaleTier(ore.tier) }
}

function isClaimedAsSignature(ore: OreType): boolean {
  return entriesOf(ORE_SIGNATURE_REGISTRY).some((tag) => tag.isSignature(ore))
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
