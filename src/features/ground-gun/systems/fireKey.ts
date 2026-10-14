/**
 * The fire key or mouse button (ticket 314 on ticket 345's held presses, the TD lock on #314
 * section 2): `fire_ground_gun` is a press action, and the hold lives only in this client input,
 * on the same `fireHold` as the tile. The press starts the hold along the cursor's aim and leaves
 * a tap in the buffer, so a press during the recovery still fires within `tapBufferTicks`; while
 * the key stays down each frame re-aims at the cursor; once it is up the hold lets go and only
 * that tap may still fire. A key has no hold delay: the touch tile's 15-tick wait tells a tap
 * from a hold, which a key's up edge already does.
 *
 * Pure: the bearing and the key's state in, the input out.
 */
import { aimedFire, heldFire, releasedFire, tappedFire } from './fireHold'
import type { FireInput } from './tilePress'

/** The key goes down at `tick`, aimed along `bearing`. */
export function keyPressedInput(input: FireInput, bearing: number, tick: number): FireInput {
  return {
    ...input,
    isKeyHeld: true,
    hold: tappedFire(heldFire(input.hold, bearing), bearing, tick),
  }
}

/** One frame: a held key follows the aim, a key let go releases the hold. */
export function keyFrameInput(input: FireInput, isKeyDown: boolean, bearing: number): FireInput {
  if (!input.isKeyHeld) return input
  if (isKeyDown) return { ...input, hold: aimedFire(input.hold, bearing) }
  return { ...input, isKeyHeld: false, hold: releasedFire(input.hold) }
}

/** A blocked shot let the hold go: the key holds nothing until it is pressed again. */
export function keyReleasedByRefusal(input: FireInput): FireInput {
  return { ...input, isKeyHeld: false }
}
