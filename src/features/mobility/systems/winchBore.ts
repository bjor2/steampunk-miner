/**
 * The winch bore on the grapple (ticket 414, the TD lock 6180863028 on #320 section 1 and the GD
 * ruling 6180873822): once per fire the lane asks the kernel `reach` point, and while a hook
 * answers past the shot's own range the shot may reel to the far end of the miner's own latest
 * bore line instead. The combos slice answers that hook (#320); this lane never imports it.
 *
 * A scalar reach cannot single out one cell, so the lane spends the boost on that one cell only:
 * every other hook keeps the shot's own range and aim cone. The far end must be within the clamped
 * reach (`reachCellsMax`), open, seen through open cells, and a cell no gate keeps from a tool
 * (gated and tip-locked cells, asked of its material). The window is the hook's and the line's:
 * once the bore no longer stands there is no far end. With no hook answering, the reach is the
 * shot's own and play is unchanged.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { boreFarEndOf } from '../../../systems/authority/bore/boreLine'
import { gateOfTile } from '../../../systems/authority/cellGates'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { scalarHookValueOf } from '../../../systems/registries/itemHooks'
import type { VehiclePose } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import type { PowerUpUse } from '../../power-up-core'
import { farEndHookOf, type GrappleHook } from './grappleHook'
import { MOBILITY_ITEM } from './itemIds'

/** The shot as the lane fires it: its own range at the use's Mark, and the hook it skips past. */
export interface WinchShot {
  rangeTiles: number
  pastTile: TilePoint | null
}

/** The bore's far end as this shot's hook, or null when the reach is not boosted or it fails. */
export function boreFarEndHookOf(
  state: AuthorityState,
  use: PowerUpUse,
  pose: VehiclePose,
  shot: WinchShot,
): GrappleHook | null {
  const reachTiles = winchReachOf(state, use, shot.rangeTiles)
  if (reachTiles <= shot.rangeTiles) return null
  const tile = ungatedFarEndOf(state, use.playerId)
  return tile === null
    ? null
    : farEndHookOf(state, pose, { tile, reachTiles, pastTile: shot.pastTile })
}

/** The shot's range after every `reach` hook on the winch, clamped once by the kernel. */
function winchReachOf(state: AuthorityState, use: PowerUpUse, rangeTiles: number): number {
  return scalarHookValueOf(state, use.playerId, {
    point: 'reach',
    parentItemId: MOBILITY_ITEM.grappleWinch,
    ctx: {
      tick: use.tick,
      mark: use.mark,
      magnitude: rangeTiles,
      origin: use.origin,
      candidates: [],
    },
    base: rangeTiles,
  })
}

/** The player's own latest bore's far end, unless a gate keeps the grapple from its cell. */
function ungatedFarEndOf(state: AuthorityState, playerId: string): TilePoint | null {
  const farEnd = boreFarEndOf(state, playerId)
  if (farEnd === null || isGatedForWinch(state, playerId, farEnd.tile)) return null
  return farEnd.tile
}

/** #142's `canMine` asked as a tool: any verdict but `cut` keeps the reel out of the cell. */
function isGatedForWinch(state: AuthorityState, playerId: string, tile: TilePoint): boolean {
  const params = planetParamsOf(state.planet)
  if (params === null) return true
  const asker = { state, playerId, params, blast: null, tool: MOBILITY_ITEM.grappleWinch }
  const gated = gateOfTile(asker, tile)
  return gated !== null && gated.verdict.outcome !== 'cut'
}
