/**
 * Which voice the drill sings in (#41 casing feel): `casing` while the cell at its nose still
 * holds lining, so the player hears casing from rock (a higher-pitched loop and denser sparks);
 * `rock` otherwise. Read from the authority replica, presentation only.
 */
import type { AuthorityState } from '../authority/authorityState'
import { planetParamsOf } from '../authority/planetOfState'
import { noseTileOf } from '../vehicle/vehiclePose'
import { isCellLined } from '../world/casingLining'

export type DrillVoice = 'rock' | 'casing'

export function drillVoiceOf(state: AuthorityState, playerId: string): DrillVoice {
  const pose = state.players[playerId]?.vehicle.pose ?? null
  const params = planetParamsOf(state.planet)
  if (pose === null || params === null) return 'rock'
  return isCellLined(state.world, params, noseTileOf(pose)) ? 'casing' : 'rock'
}
