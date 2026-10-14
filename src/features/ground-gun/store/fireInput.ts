/**
 * The local player's fire input (ticket 314): the one writer of the fire tile's press and hold, and
 * of the fire key's (`fire_ground_gun`, the mouse button or key of ticket 345). The tile's handlers
 * press, drag and release it; the key's press comes through the input reaction, which sends a shot
 * the recovery allows at once, and each frame reads whether the key is still down (`isActionDown`)
 * and where the cursor aims. Each rendered frame hands it the authority's tick, and a due shot goes
 * out as `ground_gun.fire` through the player's own intent path, so the command log records it at
 * the tick it was allowed. The authority's refusals come back through the domain events: a
 * `recovering` one is silent, any other clanks once.
 *
 * With the gimbal sight on the gun (ticket 318), a shot with no manual aim takes the sight's pick
 * rather than the facing (`sightAim.ts`).
 *
 * Plain module state, not a store field: it changes on input and every frame, and only the
 * reticle reads the aim, on the frame (CLAUDE.md, frame loop rules).
 */
import { bestBoreBearingOf } from '../../../systems/authority/bore/boreAuto'
import { nextShotTickOf } from '../../../systems/authority/bore/boreFire'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { isActionDown } from '../../../store/inputRuntime'
import { requestSoundCue } from '../../../store/soundCueRequests'
import { sightMarkOf, sightRetargetTicksAt } from '../systems/boreGunModules'
import { bearingOfAim, facingBearingOf, type RigAim } from '../systems/fireAim'
import { isClankRefusal, refusedFire, fireStepAt } from '../systems/fireHold'
import { keyFrameInput, keyPressedInput, keyReleasedByRefusal } from '../systems/fireKey'
import { gunLevelsOf, isGunMounted } from '../systems/gunLevels'
import { isSightPickDue, restingBearingOf, type SightPick } from '../systems/sightAim'
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
export const FIRE_ACTION = 'fire_ground_gun'

let input: FireInput = IDLE_INPUT
/** Where the mouse aimed on the last frame (`advanceFire`'s argument); null with no mouse. */
let cursorAim: RigAim | null = null
/** The gimbal sight's last look; null with no sight or before its first. */
let sightPick: SightPick | null = null

export function pressFireTile(): void {
  input = pressedTile(input, readAuthorityState().tick)
}

/** A drag far enough to aim, as an aim in the rig's frame. */
export function aimFireTile(aim: RigAim): void {
  input = draggedTile(input, bearingOfAim(aim, facingOf(readAuthorityState())))
}

export function releaseFireTile(): void {
  const state = readAuthorityState()
  input = releasedTile(input, state.tick, unaimedBearingOf(state))
  advanceFire(cursorAim)
}

export function cancelFireTile(): void {
  input = cancelledTile(input)
}

/**
 * The fire key goes down (the `fire_ground_gun` input reaction): with the gun mounted it holds
 * along the cursor's aim, and the shot is the reaction's intent when the recovery allows it now.
 * With no gun nothing changes and nothing is sent.
 */
export function pressFireKey(state: AuthorityState, playerId: string): CommandIntent | null {
  if (!isGunMounted(gunLevelsOf(state, playerId))) return null
  input = keyPressedInput(input, keyBearingOf(state), state.tick)
  const step = fireStepAt(input.hold, state.tick, nextShotTickOf(state, playerId))
  input = { ...input, hold: step.hold }
  return step.shotBearing === null ? null : fireIntentOf(step.shotBearing)
}

/**
 * Each rendered frame, with the cursor's aim this frame: the key follows the cursor, a long press
 * starts the held gun, and a due shot goes out.
 */
export function advanceFire(aim: RigAim | null): void {
  cursorAim = aim
  const state = readAuthorityState()
  const playerId = localPlayerId()
  input = keyFrameInput(input, isActionDown(FIRE_ACTION), keyBearingOf(state))
  const frame = frameOfTile(
    input,
    state.tick,
    nextShotTickOf(state, playerId),
    unaimedBearingOf(state),
    FIRE_TILE_FEEL.holdFireTicks,
  )
  input = frame.input
  if (frame.shotBearing !== null) sendShot(frame.shotBearing)
}

/** A `listenForDomainEvents` listener: the authority's answer to the player's shots. */
export function hearFireRefusals(events: readonly DomainEvent[], playerId: string): void {
  for (const reason of fireRefusalsOf(events, playerId)) {
    input = { ...input, hold: refusedFire(input.hold, reason) }
    if (isClankRefusal(reason)) clankRefusedShot()
  }
}

/**
 * The bearing the barrel on the rig points along now (ticket 315): the finger's aim while it aims,
 * else the key's, which follows the cursor or, with no mouse, the facing.
 */
export function readBarrelBearing(): number {
  return input.press.aimBearing ?? keyBearingOf(readAuthorityState())
}

/** The bearing the reticle draws while the finger aims; null otherwise. */
export function readAimBearing(): number | null {
  return input.press.aimBearing
}

/** Forget any press and hold, as a fresh session starts. */
export function resetFireInput(): void {
  input = IDLE_INPUT
  cursorAim = null
  sightPick = null
}

function sendShot(bearing: number): void {
  useGameStore.getState().submitPlayerIntent(fireIntentOf(bearing))
}

function fireIntentOf(bearing: number): CommandIntent {
  return { type: FIRE_COMMAND, payload: { bearing } }
}

/** A blocked shot clanks, and a held key holds nothing more until it is pressed again. */
function clankRefusedShot(): void {
  input = keyReleasedByRefusal(input)
  requestSoundCue(FIRE_TILE_FEEL.refusalClank.id)
}

/** The cursor's aim snapped into the arc, or the unaimed bearing with no mouse over the canvas. */
function keyBearingOf(state: AuthorityState): number {
  return cursorAim === null ? unaimedBearingOf(state) : bearingOfAim(cursorAim, facingOf(state))
}

/** A shot with no manual aim: the gimbal sight's pick when the gun carries one, else the facing. */
function unaimedBearingOf(state: AuthorityState): number {
  sightPick = sightPickNow(state, localPlayerId())
  return restingBearingOf(sightPick, facingBearingOf(facingOf(state)))
}

/** The sight's look, kept until its retarget wait runs out; null without a sight. */
function sightPickNow(state: AuthorityState, playerId: string): SightPick | null {
  const mark = sightMarkOf(state, playerId)
  if (mark === 0) return null
  if (!isSightPickDue(sightPick, state.tick, sightRetargetTicksAt(mark))) return sightPick
  return { pickedTick: state.tick, bearing: bestBoreBearingOf(state, playerId) }
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
