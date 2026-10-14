/**
 * The ground-gun slice (ticket 322's numbers, built out by ticket 314 from #309 build 2): the
 * player's gun levels (`ground-gun` section v1), the mount and the three brass tracks bought at
 * the Upgrade bay with their `bore-gun` content entries (claiming the `bore_gun` row, tagged
 * `armoury`, with their #159 cards), the gun the kernel's `ground_gun.fire` reads through the `boreGun` provider, and
 * the pickup of the ore its bores free, inside the trip's income cap. On the touch controls a fire
 * tile with its recovery ring fires, holds and aims (the reticle on the overlay); hold-fire and
 * the tap buffer live only in that client input, and a refused shot clanks unless it was only
 * the recovery. The bought gun shows on the rig: `vehicle-bore-gun` (#362's art) hangs at
 * `hull.front` as a vehicle piece, its barrel turned to the aim (ticket 315). The
 * `armoury.bore_gun` lane (ticket 318) adds the shipped modules as store items with their tech
 * nodes, cards and seller: the gimbal sight aims an unaimed shot, the steam sear answers auto mode
 * and the long barrel sets the reach and the hold. The five signature modules (ticket 380) shape the
 * shot through the provider: splay lines, seam turns, a cemented lining, grounding and the strut,
 * whose collapse hold reaches the kernel only through the #157 reinforcement registry; the
 * cementing round's and the strut's charges are restocked by the dock's recharge. Every weapon buy through a slice files under
 * the spend guard's one `armoury` family row, with its gun-track pin (ticket 371).
 * No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { strutReinforces } from '../../systems/authority/bore/boreStrut'
import { groundGunDebugActions } from './debug'
import { ARMOURY_SPEND_FAMILY } from './systems/armourySpend'
import { GROUND_GUN_PROJECTIONS, GROUND_GUN_RUN_EVENTS } from './logging'
import { BORE_GUN_PIECE_ID, BoreGunPiece } from './scene/BoreGunPiece'
import { FIRE_KEY_REACTION } from './store/fireKeyReaction'
import { boreGunCards } from './systems/boreGunCards'
import { BORE_GUN_KIND, boreGunParts } from './systems/boreGunContent'
import { SHIPPED_BORE_GUN_MODULES, techNodeOf, vehicleItemOf } from './systems/boreGunLane'
import { BORE_PICKUP_REACTION } from './systems/borePickup'
import { GROUND_GUN_PROVIDER } from './systems/boreGunProvider'
import { armouryArtAssets } from './systems/render/armouryMounts'
import { BORE_GUN_ATTACH_USE, boreGunArtAssets } from './systems/render/boreGunLook'
import { FIRE_TILE_FEEL } from './systems/render/fireTileFeel'
import { GUN_BAY_ENTRIES } from './systems/gunBayEntries'
import { GROUND_GUN_SECTION } from './systems/gunLevels'
import { MODULE_USE_SECTION } from './systems/moduleUse'
import { MODULE_RESTOCK_SERVICE, MODULE_USE_REACTION } from './systems/moduleUseReaction'
import { GUN_PURCHASE_RULES } from './systems/gunPurchase'
import { boreGunModuleCards } from './systems/moduleCards'
import { BORE_GUN_MODULE_SELLER } from './systems/moduleSales'
import { FireGauge } from './ui/FireGauge'
import { FireReticle } from './ui/FireReticle'
import { FireTile } from './ui/FireTile'

/** Over the chips (10): an aim the finger is making matters more than a glanceable count. */
const RETICLE_OVERLAY_PRIORITY = 20

export const slice: SliceDefinition = {
  id: 'ground-gun',
  register(r) {
    r.saveSection(GROUND_GUN_SECTION)
    r.saveSection(MODULE_USE_SECTION)
    r.content(BORE_GUN_KIND, boreGunParts())
    r.itemDescriptionEntries(boreGunCards())
    r.content('vehicle-item', SHIPPED_BORE_GUN_MODULES.map(vehicleItemOf))
    r.content('tech-node', SHIPPED_BORE_GUN_MODULES.map(techNodeOf))
    r.itemDescriptionEntries(boreGunModuleCards())
    r.vehicleItemSeller(BORE_GUN_MODULE_SELLER)
    r.commandRules(GUN_PURCHASE_RULES)
    r.bayEntry(GUN_BAY_ENTRIES)
    r.spendFamily(ARMOURY_SPEND_FAMILY)
    r.boreGun(GROUND_GUN_PROVIDER)
    r.authorityReaction(BORE_PICKUP_REACTION)
    r.authorityReaction(MODULE_USE_REACTION)
    r.dockService(MODULE_RESTOCK_SERVICE)
    // A strut stands in its mouth cell only through the #157 registry (ticket 379's rule).
    r.reinforcement({ id: 'ground-gun.strut', reinforces: strutReinforces })
    r.inputReaction(FIRE_KEY_REACTION)
    r.eventProjections(GROUND_GUN_PROJECTIONS)
    r.runEvents(GROUND_GUN_RUN_EVENTS)
    r.hudPanel({ id: 'ground-gun.fire-gauge', slot: 'gauges', Panel: FireGauge })
    r.hudPanel({ id: 'ground-gun.fire-tile', slot: 'slots', Panel: FireTile })
    r.hudPanel({
      id: 'ground-gun.reticle',
      slot: 'overlay',
      priority: RETICLE_OVERLAY_PRIORITY,
      Panel: FireReticle,
    })
    r.soundCue(FIRE_TILE_FEEL.refusalClank)
    // The mount and barrel under public/assets/vehicle/ (#214), drawn once the gun is bought.
    r.artAssets(boreGunArtAssets())
    // Every Armoury module's mount art (#364), hung on its gun once bought (ticket 321).
    r.artAssets(armouryArtAssets())
    r.attachUse(BORE_GUN_ATTACH_USE)
    r.vehiclePiece({ id: BORE_GUN_PIECE_ID, Piece: BoreGunPiece })
    // steampunkDebug.features['ground-gun'].setLevels(1, 1, 1), .getGun()
    r.debugActions(groundGunDebugActions)
  },
}
