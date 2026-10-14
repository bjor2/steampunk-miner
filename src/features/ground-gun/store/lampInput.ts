/**
 * The local player's press on the fire tile's lamp (ticket 314, the GD's 3b ruling on #314): the
 * one writer of it. A 30-tick press toggles auto-shoot through the kernel's own `set_auto` intent,
 * the one `toggle_auto_fire` sends, so the valve click (never the clank) answers it; a shorter
 * press does nothing. A click on the desktop panel's lamp toggles at once, as the key does.
 * Nothing toggles before the steam sear is researched: the kernel's intent is null then.
 */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { boreAutoToggleIntentOf } from '../../../systems/authority/bore/boreAuto'
import { lampFrameAt, pressedLamp, UNTOUCHED_LAMP, type LampPress } from '../systems/lampPress'
import { FIRE_TILE_FEEL } from '../systems/render/fireTileFeel'

let lamp: LampPress = UNTOUCHED_LAMP

export function pressFireLamp(): void {
  lamp = pressedLamp(readAuthorityState().tick)
}

export function releaseFireLamp(): void {
  lamp = UNTOUCHED_LAMP
}

/** Each rendered frame: a press that has lasted the long press toggles auto-shoot, once. */
export function advanceFireLamp(): void {
  const frame = lampFrameAt(lamp, readAuthorityState().tick, FIRE_TILE_FEEL.lampLongPressTicks)
  lamp = frame.lamp
  if (frame.isToggleDue) toggleAutoShoot()
}

/** The desktop lamp's click, and a long press come due: auto-shoot flips. */
export function toggleAutoShoot(): void {
  const game = useGameStore.getState()
  const intent = boreAutoToggleIntentOf(readAuthorityState(), game.playerId)
  if (intent !== null) game.submitPlayerIntent(intent)
}

/** Forget any press, as a fresh session starts. */
export function resetFireLamp(): void {
  lamp = UNTOUCHED_LAMP
}
