/**
 * The drill sockets' keys (the GD lock on #205 Q1 a): `use_drill_flank` (KeyF) presses what
 * `drill.flank` holds and `use_drill_collar` (KeyC) what `drill.collar` holds, through
 * `power-up-core.use_power_up`, the way a slot key presses its slot. A socket holding nothing a
 * press uses (empty, or a part of another lane) is a no-op: no command, nothing buffered or
 * logged. Whether the use is refused (charges, cooldown, a gate) is the authority's answer.
 */
import { vehicleOf } from '../../../systems/authority/authorityState'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { ActionId } from '../../../systems/input/actionMap'
import type { InputSituation } from '../../../systems/input/inputRouting'
import type { InputReactionEntry } from '../../../systems/registries/inputReactions'
import { itemInSlot } from '../../../systems/vehicle/loadoutState'
import { intentToUseSlot, type DrillGearSocket } from '../../power-up-core'
import { drillGearItemOf, type DrillGearItem } from './drillGearItems'

export const DRILL_SOCKET_REACTIONS: readonly InputReactionEntry[] = [
  socketReactionOf('use_drill_flank', 'drill.flank'),
  socketReactionOf('use_drill_collar', 'drill.collar'),
]

function socketReactionOf(actionId: ActionId, socket: DrillGearSocket): InputReactionEntry {
  return {
    id: `drill-gear.${actionId}`,
    actionId,
    contexts: ['vehicle'],
    toIntent: (situation) => socketIntentOf(situation, socket),
  }
}

function socketIntentOf(
  { state, playerId }: InputSituation,
  socket: DrillGearSocket,
): CommandIntent | null {
  const itemId = itemInSlot(vehicleOf(state, playerId).loadout, socket)
  const item = itemId === null ? null : drillGearItemOf(itemId)
  return item !== null && isPressable(item) ? intentToUseSlot(socket) : null
}

/** A toggle flips and a charged part acts; a part on while slotted has nothing to press. */
function isPressable(item: DrillGearItem): boolean {
  return item.isToggle || item.powerUpClass === 'charged'
}
