/** What the local player's drill shows now, as their replica holds it (the debug read). */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { vehicleOf } from '../../../systems/authority/authorityState'
import { drillLookStageOfPlayer } from '../systems/drillLookSource'
import { DRILL_LOOK_STEPS } from '../systems/render/drillLookSteps'

export interface DrillLookReading {
  purchases: number
  stage: number
  /** The glow colour, null at stage 0. */
  colour: string | null
}

export function readDrillLookReading(): DrillLookReading {
  const state = readAuthorityState()
  const playerId = useGameStore.getState().playerId
  const stage = drillLookStageOfPlayer(state, playerId)
  return {
    purchases: vehicleOf(state, playerId).levels.drill_power,
    stage,
    colour: stage === 0 ? null : DRILL_LOOK_STEPS[stage - 1].colour,
  }
}
