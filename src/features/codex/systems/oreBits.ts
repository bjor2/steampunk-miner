/**
 * Ore ids and the bits the codex stores them at. The ore-type provider owns the index
 * (`oreBitIndexOf`, `oreIndexTag`, #219); the codex names the index beside the bytes (`codec`) and,
 * when a save was written under the kernel default and a provider has since taken over (#146), moves
 * each bit through the alias table onto the provider's index (#178 HS/VS, #207 TD lock).
 */
import { canonicalDiscoveryKey } from '../../../systems/registries/discovery'
import {
  KERNEL_ORE_INDEX_TAG,
  oreBitIndexOf,
  oreIndexTag,
  oreTypeCatalogue,
  oreTypeOf,
  type OreType,
} from '../../../systems/registries/oreTypes'
import { RESOURCE_FAMILY } from '../../../systems/world/worldCell'
import { bitsetOf, setBitsOf } from './bitset'

const ORE_KEY_PREFIX = 'ore:'

/** The kernel default's ore id, `kernel.<family>.t<tier>` (systems/registries/oreTypes.ts). */
const KERNEL_ORE_ID = /^kernel\.(metal|crystal)\.t(0|[1-9][0-9]*)$/

/** Bytes moved onto the current index, and the bits no ore of the current index answers. */
export interface MovedOreBits {
  bytes: Uint8Array
  unplaced: readonly number[]
}

/** The ore the current provider (or the kernel default) knows by this id; null for none. */
export function oreNamed(oreId: string): OreType | null {
  return catalogueOreNamed(oreId) ?? kernelOreNamed(oreId)
}

/** The ore an `ore:` key names once canonicalised through the alias tables; null for none. */
export function oreOfKey(key: `ore:${string}`): OreType | null {
  const canonical = canonicalDiscoveryKey(key)
  if (!canonical.startsWith(ORE_KEY_PREFIX)) return null
  return oreNamed(canonical.slice(ORE_KEY_PREFIX.length))
}

export function oreKeyOf(ore: OreType): `ore:${string}` {
  return `ore:${ore.id}`
}

/** Whether bytes written under `tag` can be read by the current index, moved or as they are. */
export function isReadableIndexTag(tag: string): boolean {
  return tag === oreIndexTag() || tag === KERNEL_ORE_INDEX_TAG
}

/** `bytes` written under `tag`, on the current index. Call only with a readable tag. */
export function oreBitsOnCurrentIndex(bytes: Uint8Array, tag: string): MovedOreBits {
  if (tag === oreIndexTag()) return { bytes, unplaced: [] }
  const placed = setBitsOf(bytes).map((bit) => ({ bit, ore: oreOfKey(kernelOreKeyAt(bit)) }))
  return {
    bytes: bitsetOf(placed.flatMap(({ ore }) => (ore === null ? [] : [oreBitIndexOf(ore)]))),
    unplaced: placed.filter(({ ore }) => ore === null).map(({ bit }) => bit),
  }
}

/** The inverse of the kernel default index, `tier * 2 + (crystal ? 1 : 0)`. */
function kernelOreKeyAt(bit: number): `ore:${string}` {
  return `ore:kernel.${(bit & 1) === 1 ? 'crystal' : 'metal'}.t${bit >> 1}`
}

/** The provider's catalogue entry; looked up through a map kept per catalogue list. */
function catalogueOreNamed(oreId: string): OreType | null {
  const catalogue = oreTypeCatalogue()
  if (catalogue.length === 0) return null
  return catalogueById(catalogue).get(oreId) ?? null
}

const CATALOGUE_MAPS = new WeakMap<readonly OreType[], ReadonlyMap<string, OreType>>()

function catalogueById(catalogue: readonly OreType[]): ReadonlyMap<string, OreType> {
  const known = CATALOGUE_MAPS.get(catalogue)
  if (known !== undefined) return known
  const byId = new Map(catalogue.map((ore) => [ore.id, ore]))
  CATALOGUE_MAPS.set(catalogue, byId)
  return byId
}

/** A kernel id's ore, if the current `oreTypeOf` still answers that id for its tier and family. */
function kernelOreNamed(oreId: string): OreType | null {
  const match = KERNEL_ORE_ID.exec(oreId)
  if (match === null) return null
  const cellFamily = match[1] === 'crystal' ? RESOURCE_FAMILY.crystal : RESOURCE_FAMILY.metal
  const ore = oreTypeOf({ tier: Number.parseInt(match[2], 10), cellFamily })
  return ore.id === oreId ? ore : null
}
