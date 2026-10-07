/**
 * Each shipped terrain tool as `power-up-core` runs it (#162 section 2.1 classes, 4.2 and 4.3
 * numbers): the charged shifter and pocket lance refill at the dock, the splitter and lodestone come
 * as a stack. When the wind-up ends the tool plans its whole edit on the state the act sees, and the
 * edit joins the K6 queue on that tick (`terrainOutcome.ts`).
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import type { VehiclePose } from '../../../systems/vehicle/vehiclePose'
import type { PowerUp, PowerUpOutcome, PowerUpUse } from '../../power-up-core'
import type { EditKey } from './editSeed'
import { openGroundView, type GroundView } from './groundView'
import { MARK_IN_PLAY } from './itemMagnitude'
import { LODESTONE_BEACON_ID, plantLodestone } from './lodestoneBeacon'
import { ORE_SHIFTER_ID, planOreDrag } from './oreShifter'
import { planPressurePocket, PRESSURE_POCKET_ID } from './pressurePocket'
import { planSeamSplit, SEAM_SPLITTER_ID } from './seamSplitter'
import { SHIPPED_TERRAIN_ITEMS } from './shippedTools'
import { TERRAIN_REFUSAL } from './terrainEvents'
import { balanceOf, isConsumable, type TerrainItem } from './terrainItems'
import { editSourceOf, outcomeOfPlan, type TerrainPlan } from './terrainOutcome'

type Planner = (view: GroundView, key: EditKey, pose: VehiclePose) => TerrainPlan

type Activate = (state: AuthorityState, use: PowerUpUse) => PowerUpOutcome

const ACTIVATIONS: Readonly<Record<string, Activate>> = {
  [ORE_SHIFTER_ID]: editWith(planOreDrag),
  [SEAM_SPLITTER_ID]: editWith(planSeamSplit),
  [PRESSURE_POCKET_ID]: editWith(planPressurePocket),
  [LODESTONE_BEACON_ID]: plantLodestone,
}

export const TERRAIN_POWER_UPS: readonly PowerUp[] = SHIPPED_TERRAIN_ITEMS.map(powerUpOf)

function powerUpOf(item: TerrainItem): PowerUp {
  const balance = balanceOf(item)
  return {
    id: editSourceOf(item.itemId),
    itemId: item.itemId,
    iconId: item.iconId,
    name: item.name,
    powerUpClass: item.powerUpClass,
    charges: balance.charges,
    cooldownTicks: isConsumable(item) ? 0 : (balance.cooldownTicks ?? 0),
    windupTicks: balance.windupTicks ?? 0,
    channelTicks: 0,
    isToggle: false,
    energyDrawPerMillePerSecond: 0,
    activate: ACTIVATIONS[item.itemId],
  }
}

/** The tool plans its edit at the miner's pose; a miner out of play has nothing to act from. */
function editWith(plan: Planner): Activate {
  return (state, use) => {
    const view = openGroundView(state, use.playerId, editSourceOf(use.itemId))
    const pose = vehicleOf(state, use.playerId).pose
    if (view === null || pose === null)
      return { kind: 'refused', reason: TERRAIN_REFUSAL.outOfPlay }
    const key = { origin: use.origin, tick: use.tick, itemId: use.itemId, mark: MARK_IN_PLAY }
    const author = {
      playerId: use.playerId,
      itemId: use.itemId,
      mark: key.mark,
      origin: use.origin,
    }
    return outcomeOfPlan(state, author, plan(view, key, pose))
  }
}
