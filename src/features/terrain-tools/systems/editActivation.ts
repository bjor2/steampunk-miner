/**
 * A terrain tool's edit as `power-up-core` activates it: the tool plans its whole edit at the
 * miner's pose on the state the act sees, and the edit joins the K6 queue on that tick
 * (`terrainOutcome.ts`). A miner out of play has nothing to act from.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import type { VehiclePose } from '../../../systems/vehicle/vehiclePose'
import type { PowerUpOutcome, PowerUpUse } from '../../power-up-core'
import type { EditKey } from './editSeed'
import { openGroundView, type GroundView } from './groundView'
import { TERRAIN_REFUSAL } from './terrainEvents'
import { editSourceOf, outcomeOfPlan, type TerrainPlan } from './terrainOutcome'
import { toolVerbOf, type ToolVerb } from './toolVerb'

export type Planner = (
  view: GroundView,
  key: EditKey,
  pose: VehiclePose,
  verb: ToolVerb,
) => TerrainPlan

export type Activate = (state: AuthorityState, use: PowerUpUse) => PowerUpOutcome

/** The tool plans its edit at the miner's pose; a miner out of play has nothing to act from. */
export function editWith(plan: Planner): Activate {
  return (state, use) => {
    const view = openGroundView(state, use.playerId, editSourceOf(use.itemId))
    const miner = vehicleOf(state, use.playerId)
    const { pose } = miner
    if (view === null || pose === null)
      return { kind: 'refused', reason: TERRAIN_REFUSAL.outOfPlay }
    const key = { origin: use.origin, tick: use.tick, itemId: use.itemId, mark: use.mark }
    const author = {
      playerId: use.playerId,
      itemId: use.itemId,
      mark: key.mark,
      origin: use.origin,
    }
    return outcomeOfPlan(state, author, plan(view, key, pose, toolVerbOf(use, miner)))
  }
}
