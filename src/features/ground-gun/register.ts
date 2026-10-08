/**
 * The ground-gun slice (ticket 322's numbers, built out by ticket 314 from #309 build 2): the
 * player's gun levels (`ground-gun` section v1), the mount and the three brass tracks bought at
 * the Upgrade bay with their `bore-gun` content entries (claiming the `bore_gun` row, tagged
 * `armoury`), and the gun the kernel's `ground_gun.fire` reads through the `boreGun` provider.
 * No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { GROUND_GUN_PROJECTIONS, GROUND_GUN_RUN_EVENTS } from './logging'
import { BORE_GUN_KIND, boreGunParts } from './systems/boreGunContent'
import { GROUND_GUN_PROVIDER } from './systems/boreGunProvider'
import { GROUND_GUN_SECTION } from './systems/gunLevels'
import { GUN_PURCHASE_RULES } from './systems/gunPurchase'

export const slice: SliceDefinition = {
  id: 'ground-gun',
  register(r) {
    r.saveSection(GROUND_GUN_SECTION)
    r.content(BORE_GUN_KIND, boreGunParts())
    r.commandRules(GUN_PURCHASE_RULES)
    r.boreGun(GROUND_GUN_PROVIDER)
    r.eventProjections(GROUND_GUN_PROJECTIONS)
    r.runEvents(GROUND_GUN_RUN_EVENTS)
  },
}
