/**
 * Items on auto, on the authority's clock (ticket 317, the #310 GD decision; the core every
 * self-acting item shares, GD lock on #206). Each tick, for each player in id order and each of
 * their items on auto in item order:
 *
 * 1. the holds before any target (`rigHoldOf`: docked, stranded, anchored, a collapse warning in
 *    the rig's block; then the item's own clock, `recovering` until its ready tick; then the
 *    item's own hold, such as the trip's income cap) drop any preview and name the hold;
 * 2. with no preview, the item's best target is looked for and held to the energy reserve and the
 *    item's own hold on it; one that passes is locked: the preview, saved and digested, names the
 *    aim, the tile and the act tick `previewTicks` later (never fewer than 10). After a look that
 *    found nothing to act on, the next waits for a tick that is a multiple of
 *    `AUTO_RETARGET_TICKS`, which bounds the pick's cost (the TD on #310);
 * 3. at the act tick the locked aim is asked again as the ground stands, held as in 2, and acted
 *    on exactly: the item's own path, `AutoActed` before its events.
 *
 * So the client never sends a shot or a hold, and a replay acts on the same ticks. While a docked
 * player's items all already show `docked`, nothing is due, so a quiet clock can jump.
 */
import { AUTO_PREVIEW_TICKS_FLOOR, AUTO_RETARGET_TICKS } from '../../../constants/balance'
import type {
  AutoActor,
  AutoHoldReason,
  AutoSettings,
  AutoTarget,
} from '../../registries/autoActors'
import { vehicleOf, type AuthorityState } from '../authorityState'
import type { TickOutcome } from '../combat/combatTick'
import type { DomainEvent, DomainEventBody } from '../domainEvent'
import { autoActorOf } from './autoActorList'
import { isAboveEnergyReserve, rigHoldOf } from './autoHolds'
import {
  autoModeOf,
  autoModesOf,
  isAnyAutoModeOn,
  modesWith,
  withPlayerAutoModes,
  type AutoMode,
  type AutoPreview,
} from './autoModeState'

/** The next tick an item on auto has a look due, or null with none on. */
export function nextAutoModeTick(state: AuthorityState): number | null {
  if (!isAnyAutoModeOn(state)) return null
  return Object.keys(state.players).some((id) => hasLookDue(state, id)) ? state.tick + 1 : null
}

export function runAutoModeTick(state: AuthorityState, tick: number): TickOutcome {
  if (!isAnyAutoModeOn(state)) return { state, events: [] }
  return modeKeysOf(state).reduce<TickOutcome>(
    (outcome, { playerId, itemId }) => {
      const stepped = stepAutoMode(outcome.state, playerId, itemId, tick)
      return { state: stepped.state, events: [...outcome.events, ...stepped.events] }
    },
    { state, events: [] },
  )
}

/** A docked player whose items already all say so has nothing to look at until it undocks. */
function hasLookDue(state: AuthorityState, playerId: string): boolean {
  const modes = autoModesOf(state, playerId)
  const isDocked = vehicleOf(state, playerId).mode === 'docked'
  return modes.length > 0 && !(isDocked && modes.every((mode) => mode.hold === 'docked'))
}

function modeKeysOf(state: AuthorityState): { playerId: string; itemId: string }[] {
  return Object.keys(state.players)
    .sort()
    .flatMap((playerId) =>
      autoModesOf(state, playerId).map((mode) => ({ playerId, itemId: mode.itemId })),
    )
}

/** One item's look this tick: what its actor answers, with the numbers it runs on. */
interface ModeTurn {
  playerId: string
  tick: number
  mode: AutoMode
  actor: AutoActor
  settings: AutoSettings
}

function stepAutoMode(
  state: AuthorityState,
  playerId: string,
  itemId: string,
  tick: number,
): TickOutcome {
  const mode = autoModeOf(state, playerId, itemId) as AutoMode
  const turn = turnOrHoldOf(state, playerId, mode, tick)
  if (typeof turn === 'string') return heldMode(state, playerId, mode, turn)
  return mode.preview === null
    ? lockTargetWhenDue(state, turn)
    : actWhenDue(state, turn, mode.preview)
}

/** The item's turn, or the first hold before any target. */
function turnOrHoldOf(
  state: AuthorityState,
  playerId: string,
  mode: AutoMode,
  tick: number,
): ModeTurn | AutoHoldReason {
  const actor = autoActorOf(mode.itemId)
  const settings = actor?.settingsOf(state, playerId) ?? null
  if (actor === null || settings === null) return 'unavailable'
  const turn = { playerId, tick, mode, actor, settings }
  return holdBeforeTargetOf(state, turn) ?? turn
}

function holdBeforeTargetOf(state: AuthorityState, turn: ModeTurn): AutoHoldReason | null {
  const { playerId, tick, actor } = turn
  return (
    rigHoldOf(state, playerId, tick) ??
    recoveringHoldOf(actor.readyTickOf(state, playerId), tick) ??
    actor.holdOf(state, playerId)
  )
}

function recoveringHoldOf(readyTick: number | null, tick: number): AutoHoldReason | null {
  return readyTick === null || tick < readyTick ? 'recovering' : null
}

/** The holds a look for a target meets; after one, the next look waits for the retarget tick. */
const TARGET_HOLDS: readonly AutoHoldReason[] = ['no_target', 'energy_reserve', 'would_warn']

/** A look for a target, unless the last one found none and the retarget tick is not here yet. */
function lockTargetWhenDue(state: AuthorityState, turn: ModeTurn): TickOutcome {
  const isRetrying = turn.mode.hold !== null && TARGET_HOLDS.includes(turn.mode.hold)
  if (isRetrying && turn.tick % AUTO_RETARGET_TICKS !== 0) return { state, events: [] }
  return lockTarget(state, turn)
}

/** The best target, locked when it passes its holds; else the hold it met. */
function lockTarget(state: AuthorityState, turn: ModeTurn): TickOutcome {
  const target = turn.actor.bestTargetOf(state, turn.playerId)
  const hold = targetHoldOf(state, turn, target)
  if (hold !== null) return heldMode(state, turn.playerId, turn.mode, hold)
  const preview = previewOf(target as AutoTarget, turn)
  const { aim, tx, ty, actTick } = preview
  return {
    state: withMode(state, turn.playerId, { ...turn.mode, preview, hold: null }),
    events: stampedFor(turn, [
      { type: 'AutoTargetLocked', itemId: turn.mode.itemId, aim, tx, ty, actTick },
    ]),
  }
}

/** Before the act tick the preview stands; at it, the locked aim is acted on if it still passes. */
function actWhenDue(state: AuthorityState, turn: ModeTurn, preview: AutoPreview): TickOutcome {
  if (turn.tick < preview.actTick) return { state, events: [] }
  const target = turn.actor.targetAlong(state, turn.playerId, preview.aim)
  const hold = targetHoldOf(state, turn, target)
  if (hold !== null) return heldMode(state, turn.playerId, turn.mode, hold)
  return actOnAim(state, turn, preview.aim)
}

function targetHoldOf(
  state: AuthorityState,
  turn: ModeTurn,
  target: AutoTarget | null,
): AutoHoldReason | null {
  if (target === null) return 'no_target'
  const vehicle = vehicleOf(state, turn.playerId)
  if (!isAboveEnergyReserve(vehicle, target.energyQuanta, turn.settings.reserveAboveRescueBp)) {
    return 'energy_reserve'
  }
  return turn.actor.holdAt(state, turn.playerId, target)
}

function previewOf(target: AutoTarget, turn: ModeTurn): AutoPreview {
  const previewTicks = Math.max(turn.settings.previewTicks, AUTO_PREVIEW_TICKS_FLOOR)
  return {
    aim: target.aim,
    ...target.tile,
    lockedTick: turn.tick,
    actTick: turn.tick + previewTicks,
  }
}

/** The act through the item's own path; `AutoActed` heads its events when it did anything. */
function actOnAim(state: AuthorityState, turn: ModeTurn, aim: number): TickOutcome {
  const acted = turn.actor.act(state, turn.playerId, aim, turn.tick)
  const cleared = withMode(acted.state, turn.playerId, { ...turn.mode, preview: null, hold: null })
  const actedEvent: DomainEventBody = { type: 'AutoActed', itemId: turn.mode.itemId, aim }
  const events = acted.events.length === 0 ? [] : [actedEvent, ...acted.events]
  return { state: cleared, events: stampedFor(turn, events) }
}

/** The mode holding for `hold`, its preview dropped; the state as it was when nothing changes. */
function heldMode(
  state: AuthorityState,
  playerId: string,
  mode: AutoMode,
  hold: AutoHoldReason,
): TickOutcome {
  if (mode.hold === hold && mode.preview === null) return { state, events: [] }
  return { state: withMode(state, playerId, { ...mode, preview: null, hold }), events: [] }
}

function withMode(state: AuthorityState, playerId: string, mode: AutoMode): AuthorityState {
  return withPlayerAutoModes(state, playerId, modesWith(state, playerId, mode))
}

function stampedFor(turn: ModeTurn, bodies: readonly DomainEventBody[]): DomainEvent[] {
  return bodies.map((body): DomainEvent => ({ tick: turn.tick, playerId: turn.playerId, ...body }))
}
