/**
 * The mobility and survival lane (#204, spec #162 sections 1 and 4): the grapple winch, emergency
 * ballast, heat sink flask, steam boost, rivet patch kit, steam shield, smoke canister, grav
 * anchor, buoyancy tanks and escape thruster as vehicle items and power-ups, their
 * `tech.mobility.*` nodes with the third cradle's, their item cards, and their effects on ticket
 * 233's seams, kept in the `mobility` section and cleared on the authority clock. No side effects
 * at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { mobilityDebugActions } from './debug'
import { MOBILITY_PROJECTIONS, MOBILITY_RUN_EVENTS } from './logging'
import { MOBILITY_EFFECTS_STEP } from './systems/effectClock'
import { MOBILITY_ITEM_CARDS } from './systems/itemCards'
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
import { MOBILITY_SECTION } from './systems/mobilitySection'
import { HEAT_SINK_PAUSE, SMOKE_DETECTION, STEAM_SHIELD_INTERCEPT } from './systems/survivalEffects'

export const slice: SliceDefinition = {
  id: 'mobility',
  register(r) {
    r.content('vehicle-item', MOBILITY_VEHICLE_ITEMS)
    r.content('power-up', MOBILITY_POWER_UPS)
    r.content('tech-node', MOBILITY_TECH_NODES)
    r.itemDescriptionEntries(MOBILITY_ITEM_CARDS)
    r.saveSection(MOBILITY_SECTION)
    r.clockStep(MOBILITY_EFFECTS_STEP)
    ;[
      ANCHOR_MOTION,
      BALLAST_MOTION,
      BOOST_MOTION,
      BUOYANCY_MOTION,
      ESCAPE_MOTION,
      REEL_MOTION,
    ].forEach((source) => r.vehicleMotionEffect(source))
    r.hullDamageIntercept(STEAM_SHIELD_INTERCEPT)
    r.enemyDetectionModifier(SMOKE_DETECTION)
    r.heatPause(HEAT_SINK_PAUSE)
    r.eventProjections(MOBILITY_PROJECTIONS)
    r.runEvents(MOBILITY_RUN_EVENTS)
    // steampunkDebug.features.mobility.getEffects() / .statPreview(itemId, mark, planet)
    r.debugActions(mobilityDebugActions)
  },
}
