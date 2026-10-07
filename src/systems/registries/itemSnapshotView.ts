/**
 * The read-only view of the client's snapshot an item describer reads (TD on #164, K7 #199): the
 * few things a card line may depend on, such as the trip cap's `incomeItemValue` and `tripCap` in
 * a slice section. A describer never holds authority state, so it can neither change it nor
 * depend on what the screens do not show.
 *
 * One view per state and player, so every surface reading the same snapshot shares the
 * describer's memo (`describeItem`).
 */
import type { AuthorityState } from '../authority/authorityState'
import { dockedBayOf } from '../authority/dockRules'
import type { UpgradeLevels } from '../economy/vehicleStats'
import type { Money } from '../money'
import type { BayId } from '../world/dockBays'
import { readSection, type SaveSection } from './saveSections'

export interface ItemSnapshotView {
  readonly playerId: string
  readonly planetIndex: number
  readonly wallet: Money
  readonly levels: UpgradeLevels
  /** The bay the vehicle is docked at, null in the run: the trip cap line hides at the dock. */
  readonly dockedBay: BayId | null
  /** A slice section's value in this snapshot: the player's own, or the session's. */
  section<T>(section: SaveSection<T>): Readonly<T>
}

const viewsOfState = new WeakMap<AuthorityState, Map<string, ItemSnapshotView>>()

export function itemSnapshotViewOf(state: AuthorityState, playerId: string): ItemSnapshotView {
  const views = viewsOf(state)
  const known = views.get(playerId)
  if (known !== undefined) return known
  const view = createItemSnapshotView(state, playerId)
  views.set(playerId, view)
  return view
}

function viewsOf(state: AuthorityState): Map<string, ItemSnapshotView> {
  const known = viewsOfState.get(state)
  if (known !== undefined) return known
  const views = new Map<string, ItemSnapshotView>()
  viewsOfState.set(state, views)
  return views
}

function createItemSnapshotView(state: AuthorityState, playerId: string): ItemSnapshotView {
  const player = state.players[playerId]
  return Object.freeze({
    playerId,
    planetIndex: state.planet.index,
    wallet: player.wallet,
    levels: player.vehicle.levels,
    dockedBay: dockedBayOf(state, playerId),
    section: <T>(section: SaveSection<T>) => readSection(state, playerId, section),
  })
}
