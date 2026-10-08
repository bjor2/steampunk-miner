/**
 * A player's live lodestone beacon (TD ruling on #206, ticket 326): `lodestone_drain` reaches toward
 * it, but only `terrain-tools` knows where one waits, so that slice provides it and the item hooks
 * hand it to every answer in `ctx.beacon`, never through an import. A pure read of the saved state;
 * with no provider no player has a beacon.
 */
import type { AuthorityState } from '../authority/authorityState'
import type { TilePoint } from '../world/tileGrid'
import { defineOneProviderRegistry, entriesOf } from './seal'

export interface LiveBeacon {
  tile: TilePoint
  /** How far the beacon gathers ore at its Mark, in whole tiles. */
  gatherRadiusTiles: number
}

export interface LiveBeaconProvider {
  id: string
  /** The player's beacon waiting on the planet the state is on; null for none. */
  liveBeaconOf(state: AuthorityState, playerId: string): LiveBeacon | null
}

export const LIVE_BEACON_REGISTRY = defineOneProviderRegistry<LiveBeaconProvider>('liveBeacon')

/** The player's live beacon on this planet; null with none, or with no provider. */
export function liveBeaconOf(state: AuthorityState, playerId: string): LiveBeacon | null {
  const [provider] = entriesOf(LIVE_BEACON_REGISTRY)
  return provider === undefined ? null : provider.liveBeaconOf(state, playerId)
}
