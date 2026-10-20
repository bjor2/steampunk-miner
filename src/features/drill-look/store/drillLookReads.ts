/** What the local player's drill shows now, as their replica holds it (the debug read). */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { vehicleOf } from '../../../systems/authority/authorityState'
import { rigLookOf } from '../../rig-look'
import { DRILL_LOOK_TRACK, drillLookStageOf } from '../systems/render/drillLookSteps'

export interface DrillLookReading {
  purchases: number
  stage: number
  /** The glow colour the rig look paints, null at stage 0. */
  colour: string | null
}

export function readDrillLookReading(): DrillLookReading {
  const state = readAuthorityState()
  const purchases = vehicleOf(state, useGameStore.getState().playerId).levels.drill_power
  return {
    purchases,
    stage: drillLookStageOf(purchases),
    colour: rigLookOf(DRILL_LOOK_TRACK, purchases)?.tint ?? null,
  }
}
