/**
 * The ground-gun slice (ticket 322's numbers, built out by ticket 314 from #309 build 2): the
 * player's gun levels (`ground-gun` section v1), the mount and the three brass tracks bought at
 * the Upgrade bay with their `bore-gun` content entries (claiming the `bore_gun` row, tagged
 * `armoury`, with their #159 cards), the gun the kernel's `ground_gun.fire` reads through the `boreGun` provider, and
 * the pickup of the ore its bores free, inside the trip's income cap. On the touch controls a fire
 * tile with its recovery ring fires, holds and aims (the reticle on the overlay); hold-fire and
 * the tap buffer live only in that client input, and a refused shot clanks unless it was only
 * the recovery.
 * No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { groundGunDebugActions } from './debug'
import { GROUND_GUN_PROJECTIONS, GROUND_GUN_RUN_EVENTS } from './logging'
import { FIRE_KEY_REACTION } from './store/fireKeyReaction'
import { boreGunCards } from './systems/boreGunCards'
import { BORE_GUN_KIND, boreGunParts } from './systems/boreGunContent'
import { BORE_PICKUP_REACTION } from './systems/borePickup'
import { GROUND_GUN_PROVIDER } from './systems/boreGunProvider'
import { FIRE_TILE_FEEL } from './systems/render/fireTileFeel'
import { GUN_BAY_ENTRIES } from './systems/gunBayEntries'
import { GROUND_GUN_SECTION } from './systems/gunLevels'
import { GUN_PURCHASE_RULES } from './systems/gunPurchase'
import { FireReticle } from './ui/FireReticle'
import { FireTile } from './ui/FireTile'

/** Over the chips (10): an aim the finger is making matters more than a glanceable count. */
const RETICLE_OVERLAY_PRIORITY = 20

export const slice: SliceDefinition = {
  id: 'ground-gun',
  register(r) {
    r.saveSection(GROUND_GUN_SECTION)
    r.content(BORE_GUN_KIND, boreGunParts())
    r.itemDescriptionEntries(boreGunCards())
    r.commandRules(GUN_PURCHASE_RULES)
    r.bayEntry(GUN_BAY_ENTRIES)
    r.boreGun(GROUND_GUN_PROVIDER)
    r.authorityReaction(BORE_PICKUP_REACTION)
    r.inputReaction(FIRE_KEY_REACTION)
    r.eventProjections(GROUND_GUN_PROJECTIONS)
    r.runEvents(GROUND_GUN_RUN_EVENTS)
    r.hudPanel({ id: 'ground-gun.fire-tile', slot: 'slots', Panel: FireTile })
    r.hudPanel({
      id: 'ground-gun.reticle',
      slot: 'overlay',
      priority: RETICLE_OVERLAY_PRIORITY,
      Panel: FireReticle,
    })
    r.soundCue(FIRE_TILE_FEEL.refusalClank)
    // steampunkDebug.features['ground-gun'].setLevels(1, 1, 1), .getGun()
    r.debugActions(groundGunDebugActions)
  },
}
