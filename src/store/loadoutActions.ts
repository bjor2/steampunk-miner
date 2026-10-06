/**
 * The loadout's store-side actions (K4), kept beside the store, which stops growing (#155 section
 * 6.4): `setVehicleLoadout` submits the scenario's `debug.setVehicleLoadout`, so it replays and
 * logs `debug_command_applied`, and throws with the authority's problems when it would be refused.
 * Equipping is play and goes through `equipItem` at the platform.
 */
import { setVehicleLoadoutCommand } from '../systems/authority/loadoutCommands'
import { submitUnlessRefused } from './authorityLink'

export function setVehicleLoadout(
  playerId: string,
  slots: Readonly<Record<string, string>>,
  owned: readonly string[],
): void {
  submitUnlessRefused(playerId, setVehicleLoadoutCommand(slots, owned))
}
