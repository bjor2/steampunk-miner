/**
 * The combos' item hooks (GD lock on #206, decision 1; feature-slices.md 3.36): each shipped
 * combo answers at its partner item's authority-side decision point through the kernel registry,
 * so the lane consults it there and this slice imports no lane. A drain combo that adds yield
 * names its `incomeItemId`, so the lane's trip clamp and the pin-6 income gate count it (decision
 * 9 as amended); the magnetic survey counts under the echo sounder's, and the lens corer, which
 * only reveals, and the winch bore, which only moves, name none.
 */
import type { ItemHook } from '../../../systems/registries/itemHooks'
import {
  ASSAY_DRAIN_ID,
  assayDrainOrderOf,
  coredDrainOrderOf,
  coredDrainReachOf,
  LODESTONE_DRAIN_ID,
  lodestoneDrainOrderOf,
  lodestoneDrainReachOf,
} from './drainCombos'
import { winchBoreReachOf } from './armouryCombos'
import { CORED_DRAIN_ID } from './sampledVein'
import { alarmShieldFiresOf, lensCorerAimOf, magneticSurveyTargetOf } from './sensingCombos'

const MINERAL_DRAIN = 'power.mineral_drain'
const ORE_SHIFTER = 'power.ore_shifter'
const SAMPLING_CORER = 'gear.sampling_corer'
const STEAM_SHIELD = 'power.steam_shield'
const ECHO_SOUNDER = 'power.echo_sounder'
const GRAPPLE_WINCH = 'power.grapple_winch'

export const COMBO_HOOKS: readonly ItemHook[] = [
  {
    id: 'combos.assay_drain_order',
    hook: 'targetOrder',
    laneId: 'extraction',
    parentItemId: MINERAL_DRAIN,
    incomeItemId: ASSAY_DRAIN_ID,
    answer: assayDrainOrderOf,
  },
  {
    id: 'combos.cored_drain_reach',
    hook: 'reach',
    laneId: 'extraction',
    parentItemId: MINERAL_DRAIN,
    incomeItemId: CORED_DRAIN_ID,
    answer: coredDrainReachOf,
  },
  {
    id: 'combos.cored_drain_order',
    hook: 'targetOrder',
    laneId: 'extraction',
    parentItemId: MINERAL_DRAIN,
    incomeItemId: CORED_DRAIN_ID,
    answer: coredDrainOrderOf,
  },
  {
    id: 'combos.lodestone_drain_reach',
    hook: 'reach',
    laneId: 'extraction',
    parentItemId: MINERAL_DRAIN,
    incomeItemId: LODESTONE_DRAIN_ID,
    answer: lodestoneDrainReachOf,
  },
  {
    id: 'combos.lodestone_drain_order',
    hook: 'targetOrder',
    laneId: 'extraction',
    parentItemId: MINERAL_DRAIN,
    incomeItemId: LODESTONE_DRAIN_ID,
    answer: lodestoneDrainOrderOf,
  },
  {
    id: 'combos.magnetic_survey_target',
    hook: 'dragTarget',
    laneId: 'terrain-tools',
    parentItemId: ORE_SHIFTER,
    incomeItemId: ECHO_SOUNDER,
    answer: magneticSurveyTargetOf,
  },
  {
    id: 'combos.lens_corer_aim',
    hook: 'aim',
    laneId: 'drill-gear',
    parentItemId: SAMPLING_CORER,
    answer: lensCorerAimOf,
  },
  {
    id: 'combos.alarm_shield_fire',
    hook: 'autoFire',
    laneId: 'mobility',
    parentItemId: STEAM_SHIELD,
    answer: alarmShieldFiresOf,
  },
  {
    id: 'combos.winch_bore_reach',
    hook: 'reach',
    laneId: 'mobility',
    parentItemId: GRAPPLE_WINCH,
    answer: winchBoreReachOf,
  },
]
