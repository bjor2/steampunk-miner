/**
 * The ground-gun slice (ticket 322's numbers, built out by ticket 314 from #309 build 2): the
 * player's gun levels (`ground-gun` section v1), the mount and the three brass tracks bought at
 * the Upgrade bay with their `bore-gun` content entries (claiming the `bore_gun` row, tagged
 * `armoury`, with their #159 cards), the gun the kernel's `ground_gun.fire` reads through the `boreGun` provider, and
 * the pickup of the ore its bores free, inside the trip's income cap. On the touch controls a fire
 * tile with its recovery ring fires, holds and aims (the reticle on the overlay); hold-fire and
 * the tap buffer live only in that client input, and a refused shot clanks unless it was only
 * the recovery. The bought gun shows on the rig: `vehicle-bore-gun` (#362's art) hangs at
 * `hull.front` as a vehicle piece, its barrel turned to the aim (ticket 315), and every bought
 * Armoury module rides its gun at its mount, the auto guns' through a turret piece, gilded once
 * Mastered (ticket 321). The
 * `armoury.bore_gun` lane (ticket 318) adds the shipped modules as store items with their tech
 * nodes, cards and seller: the gimbal sight aims an unaimed shot, the steam sear answers auto mode
 * and the long barrel sets the reach and the hold. The five signature modules (ticket 380) shape the
 * shot through the provider: splay lines, seam turns, a cemented lining, grounding and the strut,
 * whose collapse hold reaches the kernel only through the #157 reinforcement registry; the
 * cementing round's and the strut's charges are restocked by the dock's recharge. The cementing round
 * is also the shoring shot (ticket 369, piece iii of the #157 seam): the cells it opens are held as
 * permanent ground from the `ground-gun.shot-cells` section, each billed at its band. Every weapon
 * buy through a slice files under the spend guard's one `armoury` family row, with its gun-track
 * pin (ticket 371). The `armoury.auto_guns` lane (ticket 388) adds the turret's eight modules as
 * store items with their nodes, cards and seller: while the guns are mounted and a module hangs at
 * its `turret.*` mount, it shapes the kernel turret's shot through the `autoGuns` provider, the
 * Flushing shell drives burrowers out through the `enemyFlushes` registry, and Overpressure's toggle
 * switch sends the kernel's `turret.burst`.
 * No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { strutReinforces } from '../../systems/authority/bore/boreStrut'
import { groundGunDebugActions } from './debug'
import { ARMOURY_SPEND_FAMILY } from './systems/armourySpend'
import { GROUND_GUN_PROJECTIONS, GROUND_GUN_RUN_EVENTS } from './logging'
import { BORE_GUN_PIECE_ID, BoreGunPiece } from './scene/BoreGunPiece'
import { TURRET_MODULES_PIECE_ID, TurretModulesPiece } from './scene/TurretModulesPiece'
import { FIRE_KEY_REACTION } from './store/fireKeyReaction'
import { boreGunCards } from './systems/boreGunCards'
import { BORE_GUN_KIND, boreGunParts } from './systems/boreGunContent'
import {
  autoGunsTechNodeOf,
  autoGunsVehicleItemOf,
  SHIPPED_AUTO_GUNS_MODULES,
} from './systems/autoGunsLane'
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
import { SHORING_SHOT_REACTION } from './systems/shoringShot'
import { SHOT_CELL_REINFORCEMENT, SHOT_CELLS_SECTION } from './systems/shotCells'
import { GUN_PURCHASE_RULES } from './systems/gunPurchase'
import { boreGunModuleCards } from './systems/moduleCards'
import { FLUSHING_SHELL_FLUSH } from './systems/flushingShell'
import { autoGunsModuleCards } from './systems/turretModuleCards'
import { AUTO_GUNS_PROVIDER } from './systems/turretShapes'
import { BORE_GUN_MODULE_SELLER } from './systems/moduleSales'
import { BurstToggle } from './ui/BurstToggle'
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
    r.saveSection(SHOT_CELLS_SECTION)
    r.content(BORE_GUN_KIND, boreGunParts())
    r.itemDescriptionEntries(boreGunCards())
    r.content('vehicle-item', SHIPPED_BORE_GUN_MODULES.map(vehicleItemOf))
    r.content('tech-node', SHIPPED_BORE_GUN_MODULES.map(techNodeOf))
    r.itemDescriptionEntries(boreGunModuleCards())
    r.content('vehicle-item', SHIPPED_AUTO_GUNS_MODULES.map(autoGunsVehicleItemOf))
    r.content('tech-node', SHIPPED_AUTO_GUNS_MODULES.map(autoGunsTechNodeOf))
    r.itemDescriptionEntries(autoGunsModuleCards())
    r.vehicleItemSeller(BORE_GUN_MODULE_SELLER)
    r.commandRules(GUN_PURCHASE_RULES)
    r.bayEntry(GUN_BAY_ENTRIES)
    r.spendFamily(ARMOURY_SPEND_FAMILY)
    r.boreGun(GROUND_GUN_PROVIDER)
    r.autoGuns(AUTO_GUNS_PROVIDER)
    r.enemyFlush(FLUSHING_SHELL_FLUSH)
    r.authorityReaction(BORE_PICKUP_REACTION)
    r.authorityReaction(MODULE_USE_REACTION)
    r.authorityReaction(SHORING_SHOT_REACTION)
    r.dockService(MODULE_RESTOCK_SERVICE)
    // A strut stands in its mouth cell only through the #157 registry (ticket 379's rule).
    r.reinforcement({ id: 'ground-gun.strut', reinforces: strutReinforces })
    // The cells a cementing round opened, held from its own section (ticket 369).
    r.reinforcement(SHOT_CELL_REINFORCEMENT)
    r.inputReaction(FIRE_KEY_REACTION)
    r.eventProjections(GROUND_GUN_PROJECTIONS)
    r.runEvents(GROUND_GUN_RUN_EVENTS)
    r.hudPanel({ id: 'ground-gun.fire-gauge', slot: 'gauges', Panel: FireGauge })
    r.hudPanel({ id: 'ground-gun.burst-toggle', slot: 'gauges', Panel: BurstToggle })
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
    r.vehiclePiece({ id: TURRET_MODULES_PIECE_ID, Piece: TurretModulesPiece })
    // steampunkDebug.features['ground-gun'].setLevels(1, 1, 1), .getGun()
    r.debugActions(groundGunDebugActions)
  },
}
