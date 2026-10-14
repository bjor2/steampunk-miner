/**
 * The mobility and survival lane (#204, spec #162 sections 1 and 4): the grapple winch, emergency
 * ballast, heat sink flask, steam boost, rivet patch kit, steam shield, smoke canister, grav
 * anchor, buoyancy tanks and escape thruster as vehicle items and power-ups, their
 * `tech.mobility.*` nodes with the third cradle's, their item cards, and their effects on ticket
 * 233's seams, kept in the `mobility` section and cleared on the authority clock, and the rivet
 * patch's hold cues (ticket 253), and their Mark milestone verbs (ticket 275), and the steam
 * shield acting on its own through the `autoFire` hook on #317's auto core, switched with the
 * sear's toggle (ticket 328), and the Belay Line twist's standing line through the kernel `twist`
 * hook (ticket 329). No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { mobilityDebugActions } from './debug'
import { MOBILITY_PROJECTIONS, MOBILITY_RUN_EVENTS } from './logging'
import { BELAY_MOTION } from './systems/belayLine'
import { MOBILITY_EFFECTS_STEP } from './systems/effectClock'
import { MOBILITY_ITEM_CARDS } from './systems/itemCards'
import { MILESTONE_MOTION } from './systems/milestoneMoves'
import { MOBILITY_TECH_NODES, MOBILITY_VEHICLE_ITEMS } from './systems/mobilityContent'
import {
  ANCHOR_MOTION,
  BALLAST_MOTION,
  BOOST_MOTION,
  BUOYANCY_MOTION,
  ESCAPE_MOTION,
  REEL_MOTION,
} from './systems/mobilityMotion'
import { MOBILITY_POWER_UPS } from './systems/mobilityPowerUps'
import { MOBILITY_SELLER } from './systems/mobilitySales'
import { MOBILITY_SECTION } from './systems/mobilitySection'
import { RIVET_HOLD_CUES } from './systems/rivetPatch'
import { SHARED_AUTO_SWITCH } from './systems/sharedAutoSwitch'
import { SHIELD_AUTO_ACTOR } from './systems/shieldAuto'
import { HEAT_SINK_PAUSE, SMOKE_DETECTION, STEAM_SHIELD_INTERCEPT } from './systems/survivalEffects'

export const slice: SliceDefinition = {
  id: 'mobility',
  register(r) {
    r.content('vehicle-item', MOBILITY_VEHICLE_ITEMS)
    r.content('power-up', MOBILITY_POWER_UPS)
    r.content('tech-node', MOBILITY_TECH_NODES)
    r.itemDescriptionEntries(MOBILITY_ITEM_CARDS)
    // The one-offs on sale at the Upgrade bay once researched (ticket 248).
    r.vehicleItemSeller(MOBILITY_SELLER)
    r.saveSection(MOBILITY_SECTION)
    r.clockStep(MOBILITY_EFFECTS_STEP)
    ;[
      ANCHOR_MOTION,
      BALLAST_MOTION,
      BELAY_MOTION,
      BOOST_MOTION,
      BUOYANCY_MOTION,
      ESCAPE_MOTION,
      REEL_MOTION,
      MILESTONE_MOTION,
    ].forEach((source) => r.vehicleMotionEffect(source))
    r.hullDamageIntercept(STEAM_SHIELD_INTERCEPT)
    r.enemyDetectionModifier(SMOKE_DETECTION)
    r.heatPause(HEAT_SINK_PAUSE)
    r.slotHoldCue(RIVET_HOLD_CUES)
    r.autoActor(SHIELD_AUTO_ACTOR)
    r.authorityReaction(SHARED_AUTO_SWITCH)
    r.eventProjections(MOBILITY_PROJECTIONS)
    r.runEvents(MOBILITY_RUN_EVENTS)
    // steampunkDebug.features.mobility.getEffects() / .statPreview(itemId, mark, planet)
    r.debugActions(mobilityDebugActions)
  },
}
