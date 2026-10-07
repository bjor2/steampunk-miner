/**
 * The codex alias table for the kernel's ore ids (#207 alias hook, GD and TD locks on #146): before
 * this slice the kernel named an ore `kernel.<metal|crystal>.t<tier>`, and a save written then keeps
 * its discoveries through these keys. The kernel's two families are the catalogue's `metal` and
 * `crystal` (cell codes 1 and 2), so each id maps onto that family's type at the same tier. Family ids
 * stay stable once shipped; a later rename adds an alias here.
 */
import type { DiscoveryAliasTable, DiscoveryKey } from '../../../systems/registries/discovery'
import { oreTypeOf } from './oreCatalogue'
import { lastCampaignOreTier } from './oreTypeProvider'

export const KERNEL_ORE_ALIASES_ID = 'ores.kernel-ids'

/** The families the kernel default named, by the name it gave them. */
const KERNEL_FAMILIES = ['metal', 'crystal'] as const

/** Every campaign tier of both kernel families, `ore:kernel.<family>.t<tier>` to its type id. */
export function kernelOreAliases(): DiscoveryAliasTable {
  return { id: KERNEL_ORE_ALIASES_ID, aliases: Object.fromEntries(aliasEntries()) }
}

function aliasEntries(): [DiscoveryKey, DiscoveryKey][] {
  const tiers = Array.from({ length: lastCampaignOreTier() }, (_, at) => at + 1)
  return KERNEL_FAMILIES.flatMap((family) => tiers.map((tier) => aliasOf(family, tier)))
}

function aliasOf(family: string, tier: number): [DiscoveryKey, DiscoveryKey] {
  return [`ore:kernel.${family}.t${tier}`, `ore:${oreTypeOf(family, tier).id}`]
}
