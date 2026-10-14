/**
 * The gamepad device adapter (ticket 346, the #314 TD lock section 2): the one writer of what the
 * pad holds. The shell polls the pad once per animation frame while one is connected and hands the
 * frame here; each input that crosses its press or release value becomes one pad change for the
 * input runtime, so a pad press is a key press under its own code (#217 press, #332 any-layer
 * release) and a held button presses once, whatever the frame rate. A pad that disconnects lets go
 * of everything it held.
 *
 * The right stick is the bore gun's aim: `readPadAim` is the kernel read the ground-gun slice turns
 * into a bearing (its `bearingOfAim`), so no slice ever polls the device. With no pad connected
 * nothing here runs and the key, mouse and touch streams are what they were.
 *
 * Plain module state, not a store field: it changes every frame and only the input layer and the
 * gun's frame loop read it (CLAUDE.md, frame loop rules). Nothing allocates per frame.
 */
import { PAD_INPUTS, PAD_MODIFIER, type PadInput } from '../systems/input/padCodes'
import {
  isPadInputHeld,
  padInputValueOf,
  readPadAimInto,
  type PadAim,
  type PadReading,
} from '../systems/input/padFrame'
import { routePadChange } from './inputRuntime'

const heldCodes = new Set<string>()
const aim: PadAim = { x: 0, y: 0 }
let isAiming = false

/** One polled pad frame from the shell, or null once the pad is gone. */
export function routePadFrame(pad: PadReading | null): void {
  if (pad === null) return letGoOfPad()
  PAD_INPUTS.forEach((input) => routePadInput(pad, input))
  isAiming = readPadAimInto(pad, aim)
}

/**
 * Where the right stick aims, in screen directions (x right, y down), or null while it rests in its
 * deadzone or no pad is connected; then the gun fires along the facing. One shared value the next
 * frame overwrites: copy it to keep it.
 */
export function readPadAim(): Readonly<PadAim> | null {
  return isAiming ? aim : null
}

/** Nothing held and no aim; tests and a fresh session start here. */
export function resetPad(): void {
  heldCodes.clear()
  isAiming = false
}

/** Inputs go in index order, so LB (index 4) is held before a d-pad press in the same frame. */
function routePadInput(pad: PadReading, input: PadInput): void {
  const wasHeld = heldCodes.has(input.code)
  const isHeld = isPadInputHeld(padInputValueOf(pad, input.source), wasHeld)
  if (isHeld === wasHeld) return
  if (isHeld) heldCodes.add(input.code)
  else heldCodes.delete(input.code)
  routePadChange({ code: input.code, isDown: isHeld, isModifierHeld: heldCodes.has(PAD_MODIFIER) })
}

function letGoOfPad(): void {
  heldCodes.forEach(releasePadCode)
  heldCodes.clear()
  isAiming = false
}

function releasePadCode(code: string): void {
  routePadChange({ code, isDown: false, isModifierHeld: false })
}
