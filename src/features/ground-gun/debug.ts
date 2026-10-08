/**
 * The ground-gun's debug actions, as `steampunkDebug.features['ground-gun']`: `setLevels(rate,
 * penetration, energy)` sets the gun free through `debug.ground-gun.setLevels`, so it replays and
 * logs `debug_command_applied` and never counts as play (all zero takes the gun off); `getGun()`
 * reads the local player's levels, the fire tile's ring, the recovery clock and the finger's aim,
 * the same reads the tile and the reticle draw from.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { submitSliceDebugCommand } from '../../debug/sliceDebugCommands'
import { readAuthorityState } from '../../store/authorityLink'
import { useGameStore } from '../../store/gameStore'
import { nextShotTickOf } from '../../systems/authority/bore/boreFire'
import { readAimBearing } from './store/fireInput'
import { readFireTile } from './store/fireTileReads'
import { gunLevelsOf } from './systems/gunLevels'

export const groundGunDebugActions: Readonly<Record<string, DebugAction>> = {
  setLevels: (rate, penetration, energy) =>
    submitSliceDebugCommand({
      type: 'debug.ground-gun.setLevels',
      payload: {
        rate: rate as number,
        penetration: penetration as number,
        energy: energy as number,
      },
    }),
  getGun: () => {
    const state = readAuthorityState()
    const playerId = useGameStore.getState().playerId
    return {
      ok: true,
      levels: gunLevelsOf(state, playerId),
      tile: readFireTile(),
      tick: state.tick,
      nextShotTick: nextShotTickOf(state, playerId),
      aimBearing: readAimBearing(),
    }
  },
}
