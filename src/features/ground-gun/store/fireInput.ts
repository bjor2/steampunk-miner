/**
 * The local player's fire input (ticket 314): the one writer of the fire tile's press and hold.
 * The tile's handlers press, drag and release it; each rendered frame hands it the authority's
 * tick, and a due shot goes out as `ground_gun.fire` through the player's own intent path, so the
 * command log records it at the tick it was allowed. The authority's refusals come back through
 * the domain events: a `recovering` one is silent, any other clanks once.
 *
 * Plain module state, not a store field: it changes on input and every frame, and only the
 * reticle reads the aim, on the frame (CLAUDE.md, frame loop rules).
 */
import { nextShotTickOf } from '../../../systems/authority/bore/boreFire'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { requestSoundCue } from '../../../store/soundCueRequests'
import { bearingOfAim, facingBearingOf, type RigAim } from '../systems/fireAim'
import { isClankRefusal, refusedFire } from '../systems/fireHold'
import { FIRE_TILE_FEEL } from '../systems/render/fireTileFeel'
import {
  cancelledTile,
  draggedTile,
  frameOfTile,
  IDLE_INPUT,
  pressedTile,
  releasedTile,
  type FireInput,
} from '../systems/tilePress'

const FIRE_COMMAND = 'ground_gun.fire'

let input: FireInput = IDLE_INPUT

export function pressFireTile(): void {
  input = pressedTile(input, readAuthorityState().tick)
}

/** A drag far enough to aim, as an aim in the rig's frame. */
export function aimFireTile(aim: RigAim): void {
  input = draggedTile(input, bearingOfAim(aim, facingOf(readAuthorityState())))
}

export function releaseFireTile(): void {
  const state = readAuthorityState()
  input = releasedTile(input, state.tick, facingBearingOf(facingOf(state)))
  advanceFire()
}

export function cancelFireTile(): void {
  input = cancelledTile(input)
}

/** Each rendered frame: a long press starts the held gun, and a due shot goes out. */
export function advanceFire(): void {
  const state = readAuthorityState()
  const playerId = localPlayerId()
  const frame = frameOfTile(
    input,
    state.tick,
    nextShotTickOf(state, playerId),
    facingBearingOf(facingOf(state)),
    FIRE_TILE_FEEL.holdFireTicks,
  )
  input = frame.input
  if (frame.shotBearing !== null) sendShot(frame.shotBearing)
}

/** A `listenForDomainEvents` listener: the authority's answer to the player's shots. */
export function hearFireRefusals(events: readonly DomainEvent[], playerId: string): void {
  for (const reason of fireRefusalsOf(events, playerId)) {
    input = { ...input, hold: refusedFire(input.hold, reason) }
    if (isClankRefusal(reason)) requestSoundCue(FIRE_TILE_FEEL.refusalClank.id)
  }
}

/** The bearing the reticle draws while the finger aims; null otherwise. */
export function readAimBearing(): number | null {
  return input.press.aimBearing
}

/** Forget any press and hold, as a fresh session starts. */
export function resetFireInput(): void {
  input = IDLE_INPUT
}

function sendShot(bearing: number): void {
  const intent: CommandIntent = { type: FIRE_COMMAND, payload: { bearing } }
  useGameStore.getState().submitPlayerIntent(intent)
}

function fireRefusalsOf(events: readonly DomainEvent[], playerId: string): string[] {
  return events.flatMap((event) =>
    event.type === 'CommandRejected' &&
    event.commandType === FIRE_COMMAND &&
    event.playerId === playerId
      ? [event.reason]
      : [],
  )
}

function facingOf(state: AuthorityState) {
  return vehicleOf(state, localPlayerId()).pose?.facing ?? null
}

function localPlayerId(): string {
  return useGameStore.getState().playerId
}
