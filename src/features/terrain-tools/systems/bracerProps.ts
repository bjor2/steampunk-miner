/**
 * The Bracer branch's props (GD lock on #255, ticket 269): whenever a collapse block round the rig
 * (ring 1 of its tile, as the lode clamp braces) starts to warn, the frame props it for the
 * Bracer's Mark magnitude in ticks. The props go through the kernel's `collapseBraces` seam
 * (ticket 331): a propped block holds in its warning and never refills; when its prop ends it warns
 * afresh, so a rig that stays props it again, and one that has left gives the block its 60 ticks.
 * The kernel logs each prop as `collapse_braced` by `terrain-tools.bracer-props`.
 *
 * - **When.** An authority reaction hears each `CollapseWarned` and props the blocks that touch a
 *   Bracer rig out of the dock. Reactions are no brace sync point, so the prop is seen from the
 *   next tick's sync, well inside the warning.
 * - **Saved.** The props sit in the player's `terrain-tools` section (`props`, absent while none
 *   holds), so the claims are derived from the save alone. A prop on another planet holds nothing.
 * - **Gate.** A player's props hold only while the Bracer is the lane's active branch.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import type {
  CollapseBraceClaim,
  CollapseBraceProvider,
} from '../../../systems/registries/collapseBraces'
import { tileOfPose } from '../../../systems/vehicle/vehiclePose'
import { blockIdOf, blocksTouchingTile } from '../../../systems/world/collapseBlock'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { bracerPropTicksOf } from './terrainFork'
import { terrainToolsOf, withBracerProps, type BracerProp } from './terrainSection'

export const BRACER_PROPS_ID = 'terrain-tools.bracer-props'

/** The blocks round the rig a prop reaches: the touching ring, as the lode clamp's GD ruling. */
const PROP_RING = 1

export const BRACER_PROPS_REACTION: AuthorityReaction = {
  id: BRACER_PROPS_ID,
  react: (_before, after, heard) => propWarnedBlocks(after, heard),
}

export const BRACER_PROP_BRACES: CollapseBraceProvider = {
  id: BRACER_PROPS_ID,
  bracesAt: (state) => propClaimsOf(state),
}

/** Every Bracer rig props the blocks that just started to warn round it. */
export function propWarnedBlocks(state: AuthorityState, heard: readonly DomainEvent[]): RuleEffect {
  const warned = warnedBlocksIn(heard)
  if (warned.length === 0) return unchanged(state)
  const propped = playerIdsOf(state).reduce(
    (running, playerId) => withPropsOfPlayer(running, playerId, warned),
    state,
  )
  return unchanged(propped)
}

/** Each player's props on this planet, while the Bracer is that player's active branch. */
export function propClaimsOf(state: AuthorityState): CollapseBraceClaim[] {
  return playerIdsOf(state).flatMap((playerId) =>
    bracerPropTicksOf(state, playerId) === null ? [] : propsHeldOn(state, playerId),
  )
}

function propsHeldOn(state: AuthorityState, playerId: string): CollapseBraceClaim[] {
  return propsOf(state, playerId)
    .filter((prop) => prop.planetIndex === state.planet.index)
    .map(({ block, untilTick }) => ({ block, untilTick }))
}

function withPropsOfPlayer(
  state: AuthorityState,
  playerId: string,
  warned: readonly string[],
): AuthorityState {
  const propTicks = bracerPropTicksOf(state, playerId)
  const tile = rigTileOutOfDockOf(state, playerId)
  if (propTicks === null || tile === null) return state
  const fresh = freshPropsOf(state, tile, warned, propTicks)
  if (fresh.length === 0) return state
  return withBracerProps(state, playerId, propsAfter(propsOf(state, playerId), fresh, state))
}

/** A prop for each warned block that touches the rig's tile. */
function freshPropsOf(
  state: AuthorityState,
  tile: TilePoint,
  warned: readonly string[],
  propTicks: number,
): BracerProp[] {
  const near = new Set(blocksTouchingTile(tile, PROP_RING).map(blockIdOf))
  return warned
    .filter((block) => near.has(block))
    .map((block) => ({ block, planetIndex: state.planet.index, untilTick: state.tick + propTicks }))
}

/** The props still holding on this planet, a fresh one replacing any on its block. */
function propsAfter(
  props: readonly BracerProp[],
  fresh: readonly BracerProp[],
  state: AuthorityState,
): BracerProp[] {
  const freshBlocks = new Set(fresh.map((prop) => prop.block))
  const kept = props.filter((prop) => isHoldingOn(prop, state) && !freshBlocks.has(prop.block))
  return [...kept, ...fresh]
}

function isHoldingOn(prop: BracerProp, state: AuthorityState): boolean {
  return prop.planetIndex === state.planet.index && prop.untilTick > state.tick
}

function warnedBlocksIn(heard: readonly DomainEvent[]): string[] {
  return heard.flatMap((event) => (event.type === 'CollapseWarned' ? [event.block] : []))
}

/** The rig's tile while it is out in the ground; null docked or with no pose. */
function rigTileOutOfDockOf(state: AuthorityState, playerId: string): TilePoint | null {
  const vehicle = vehicleOf(state, playerId)
  if (vehicle.pose === null || vehicle.mode === 'docked') return null
  return tileOfPose(vehicle.pose)
}

function propsOf(state: AuthorityState, playerId: string): readonly BracerProp[] {
  return terrainToolsOf(state, playerId).props ?? []
}

/** Sorted, so two players prop in the same order on every machine. */
function playerIdsOf(state: AuthorityState): string[] {
  return Object.keys(state.players).sort()
}
