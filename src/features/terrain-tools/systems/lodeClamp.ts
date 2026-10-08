/**
 * The lode clamp (GD lock on #246, the anchor verb; the GD and TD rulings on #285, ticket 285): a
 * field held while its slot is held, up to its Mark's duration, that braces the collapse blocks
 * round the cells it pins. It moves nothing.
 *
 * - **The pinned set.** When the wind-up ends, the nearest cells within the clamp's reach of the
 *   rig's tile (by distance, then `tx`, then `ty`) that the kernel's magnet rule may hold
 *   (`cellsMagnetMayHold`, #283): at most 8 diggable cells, never a gated, core or lava cell. The
 *   set is fixed at the act and saved in the `terrain-tools` section. A field with none to pin is
 *   refused and costs nothing.
 * - **The brace.** One `collapseBraces` provider claims every block that contains or borders a
 *   pinned cell (ring 1), open-ended, while the clamp is owned and its field held. When the field
 *   ends the kernel gives each braced block a fresh 60-tick warning (#331).
 * - **Three ends, one path.** Letting go of the slot (`release`, #332), the duration running out
 *   and the tank running dry all end the field the same way, on the tick they happen: the cooldown
 *   counts from that tick (never under 600, the family floor) and `magnet_used` is logged once,
 *   with the energy the whole hold drew. The release ends it in its command, the other two in the
 *   clock step, so the kernel's brace sync sees the end on its tick.
 * - **The draw.** Each authority tick the field is held it draws the drill's live per-tick draw,
 *   once per tick, never per substep, so holding costs what digging costs and a bigger tank does
 *   not make it dearer. The tank then follows the kernel's energy rules, as after drilling.
 *
 * The field also ends when its vehicle leaves play (docked, towed or wrecked) or the clamp leaves
 * its slot, as a toggle stops drawing there.
 */
import {
  vehicleOf,
  withVehicle,
  type AuthorityState,
} from '../../../systems/authority/authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import { ownsItem } from '../../../systems/authority/loadoutRules'
import { cellsMagnetMayHold } from '../../../systems/authority/magnet/shiftCellsByMagnet'
import { followEnergyChange } from '../../../systems/authority/vehicleTransitions'
import type { ClockStep } from '../../../systems/registries/clockSteps'
import type {
  CollapseBraceClaim,
  CollapseBraceProvider,
} from '../../../systems/registries/collapseBraces'
import { ENERGY_QUANTA_PER_TICK } from '../../../systems/vehicle/energyQuanta'
import { slotHoldingItem } from '../../../systems/vehicle/loadoutState'
import { tileOfPose } from '../../../systems/vehicle/vehiclePose'
import type { VehicleState } from '../../../systems/vehicle/vehicleState'
import { blockIdOf, blocksTouchingTile } from '../../../systems/world/collapseBlock'
import type { TilePoint } from '../../../systems/world/tileGrid'
import {
  startCooldownAt,
  type PowerUpOutcome,
  type PowerUpUse,
  type SlotHold,
  type SlotRelease,
} from '../../power-up-core'
import { tilesNearestFirstByPlace } from './editGeometry'
import { magnetBalanceOf, magnetItemOf, type MagnetItem } from './magnetItems'
import { magnetUsedOf, TERRAIN_REFUSAL } from './terrainEvents'
import { editSourceOf } from './terrainOutcome'
import { terrainToolsOf, withClampField, type ClampField } from './terrainSection'

export const LODE_CLAMP_ID = 'power.lode_clamp'

/**
 * Contains-or-borders (the GD ruling on #285 Q1): ring 1 braces the block holding a pinned cell and
 * every block holding one of its 8 neighbours. The GD's containing-only fallback, should the bot's
 * pace check fail, is ring 0.
 */
const BRACE_RING = 1

export const LODE_CLAMP_BRACES: CollapseBraceProvider = {
  id: 'terrain-tools.lode-clamp',
  bracesAt: clampBracesAt,
}

export const HOLD_LODE_CLAMPS_STEP: ClockStep = {
  id: 'terrain-tools.hold-lode-clamps',
  nextTick: nextHeldTickOf,
  run: holdClampsAt,
}

/** The wind-up has ended: the field locks over the cells it may pin, or is refused with none. */
export function lockClampField(state: AuthorityState, use: PowerUpUse): PowerUpOutcome {
  const pose = vehicleOf(state, use.playerId).pose
  if (pose === null) return { kind: 'refused', reason: TERRAIN_REFUSAL.outOfPlay }
  const cells = cellsToPinOf(state, use.playerId, tileOfPose(pose))
  if (cells.length === 0) return { kind: 'refused', reason: TERRAIN_REFUSAL.nothingToPin }
  const field = { cells, startTick: use.tick, finishTick: use.tick + durationOf(use), energy: 0 }
  return { kind: 'acted', effect: unchanged(withClampField(state, use.playerId, field)) }
}

/** The slot let go while the field is held: the field ends on the release tick. */
export function releaseClampField(state: AuthorityState, release: SlotRelease): PowerUpOutcome {
  const { clamp } = terrainToolsOf(state, release.playerId)
  if (clamp === undefined) return { kind: 'refused', reason: TERRAIN_REFUSAL.outOfPlay }
  return { kind: 'acted', effect: endClampField(state, release.playerId, clamp, release.tick) }
}

/** The held field as the slot's ring reads it; null while none is held. */
export function clampHoldOf(state: AuthorityState, playerId: string): SlotHold | null {
  const { clamp } = terrainToolsOf(state, playerId)
  if (clamp === undefined) return null
  return { startTick: clamp.startTick, finishTick: clamp.finishTick }
}

/** The blocks every held field braces, each pinned cell's ring once. */
export function clampBracesAt(state: AuthorityState): CollapseBraceClaim[] {
  const blocks = new Set(playerIdsOf(state).flatMap((playerId) => bracedBlocksOf(state, playerId)))
  return [...blocks].sort().map((block) => ({ block, untilTick: null }))
}

/** The block ids the player's field braces; none without a field or without owning the clamp. */
export function bracedBlocksOf(state: AuthorityState, playerId: string): string[] {
  const { clamp } = terrainToolsOf(state, playerId)
  if (clamp === undefined || !ownsItem(state, playerId, LODE_CLAMP_ID)) return []
  return clamp.cells.flatMap((cell) => blocksTouchingTile(cell, BRACE_RING).map(blockIdOf))
}

/**
 * The drill's live draw a tick at the rig's drill level (the GD ruling on #285 Q3): a constant of
 * the economy today, the same at every drill level.
 */
export function drillDrawQuantaOf(): number {
  return ENERGY_QUANTA_PER_TICK.drill
}

function cellsToPinOf(state: AuthorityState, playerId: string, centre: TilePoint): TilePoint[] {
  const reach = magnetBalanceOf(lodeClamp()).reachTiles ?? 0
  return cellsMagnetMayHold(state, {
    playerId,
    source: editSourceOf(LODE_CLAMP_ID),
    tiles: tilesNearestFirstByPlace(centre, reach),
  })
}

/** The field's length at the use's Mark; the bought length for a use read without one. */
function durationOf(use: PowerUpUse): number {
  return use.magnitude ?? magnetBalanceOf(lodeClamp()).magnitude
}

/** Every held field draws on each tick, so the clock runs live while one is held. */
function nextHeldTickOf(state: AuthorityState): number | null {
  const isHeld = playerIdsOf(state).some(
    (playerId) => terrainToolsOf(state, playerId).clamp !== undefined,
  )
  return isHeld ? state.tick + 1 : null
}

function holdClampsAt(state: AuthorityState, tick: number): RuleEffect {
  return chainEffects(
    state,
    playerIdsOf(state).map(
      (playerId) => (current: AuthorityState) => holdClampAt(current, playerId, tick),
    ),
  )
}

/** One tick of a held field: it ends at its length, out of play or unslotted, else draws. */
function holdClampAt(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  const { clamp } = terrainToolsOf(state, playerId)
  if (clamp === undefined) return unchanged(state)
  if (tick >= clamp.finishTick) return endClampField(state, playerId, clamp, clamp.finishTick)
  if (!canHoldField(vehicleOf(state, playerId))) return endClampField(state, playerId, clamp, tick)
  return drawClampTick(state, playerId, clamp, tick)
}

/** The tick's draw, then the kernel's energy rules; a tank it empties ends the field. */
function drawClampTick(
  state: AuthorityState,
  playerId: string,
  clamp: ClampField,
  tick: number,
): RuleEffect {
  const drawn = drawnFromTank(state, playerId, clamp)
  return chainEffects(drawn.state, [
    (current) => followEnergyChange(current, playerId, tick),
    (current) => endIfTankDry(current, playerId, drawn.clamp, tick),
  ])
}

function drawnFromTank(
  state: AuthorityState,
  playerId: string,
  clamp: ClampField,
): { state: AuthorityState; clamp: ClampField } {
  const vehicle = vehicleOf(state, playerId)
  const quanta = Math.min(vehicle.energy, drillDrawQuantaOf())
  const drawn = { ...clamp, energy: clamp.energy + quanta }
  const tank = withVehicle(state, playerId, { ...vehicle, energy: vehicle.energy - quanta })
  return { state: withClampField(tank, playerId, drawn), clamp: drawn }
}

function endIfTankDry(
  state: AuthorityState,
  playerId: string,
  clamp: ClampField,
  tick: number,
): RuleEffect {
  if (vehicleOf(state, playerId).energy > 0) return unchanged(state)
  return endClampField(state, playerId, clamp, tick)
}

/**
 * Every way the field ends: it is taken away, the cooldown counts from `tick`, and `magnet_used`
 * logs the hold once with the energy it drew. The braces end with it.
 */
function endClampField(
  state: AuthorityState,
  playerId: string,
  clamp: ClampField,
  tick: number,
): RuleEffect {
  const ended = startCooldownAt(
    withClampField(state, playerId, null),
    playerId,
    LODE_CLAMP_ID,
    tick,
  )
  const used = magnetUsedOf({
    playerId,
    itemId: LODE_CLAMP_ID,
    verb: lodeClamp().verb,
    cellsMoved: 0,
    energy: clamp.energy,
  })
  return { state: ended, events: [used] }
}

/** An active vehicle in play with the clamp still in a slot. */
function canHoldField(vehicle: VehicleState): boolean {
  const isInPlay = vehicle.mode === 'active' && vehicle.pose !== null
  return isInPlay && slotHoldingItem(vehicle.loadout, LODE_CLAMP_ID) !== null
}

/** Sorted, so two players' fields resolve in the same order on every machine. */
function playerIdsOf(state: AuthorityState): string[] {
  return Object.keys(state.players).sort()
}

function lodeClamp(): MagnetItem {
  const item = magnetItemOf(LODE_CLAMP_ID)
  if (item === null) throw new RangeError(`no ${LODE_CLAMP_ID} row`)
  return item
}
