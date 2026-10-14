/**
 * A finger on the fire tile's brass lamp (ticket 314, the GD's ruling 3b on #314): the lamp is its
 * own hit target, so a press that starts on it never fires or aims. Held `longPressTicks` (30) it
 * toggles auto-shoot once, whatever the finger does after; let go sooner, it does nothing. The
 * tile body keeps its own tap, 15-tick hold-fire and drag, so the two never compete.
 *
 * Pure: ticks in, whether the toggle is due out.
 */
export interface LampPress {
  /** The tick the finger came down on the lamp; null with none down. */
  pressedTick: number | null
  /** This press already toggled auto-shoot. */
  hasToggled: boolean
}

export const UNTOUCHED_LAMP: LampPress = { pressedTick: null, hasToggled: false }

export interface LampFrame {
  lamp: LampPress
  isToggleDue: boolean
}

export function pressedLamp(tick: number): LampPress {
  return { pressedTick: tick, hasToggled: false }
}

/** One frame at `tick`: the toggle is due once, on the first frame the press has lasted long enough. */
export function lampFrameAt(lamp: LampPress, tick: number, longPressTicks: number): LampFrame {
  if (!isLongPressDue(lamp, tick, longPressTicks)) return { lamp, isToggleDue: false }
  return { lamp: { ...lamp, hasToggled: true }, isToggleDue: true }
}

function isLongPressDue(lamp: LampPress, tick: number, longPressTicks: number): boolean {
  if (lamp.pressedTick === null || lamp.hasToggled) return false
  return tick - lamp.pressedTick >= longPressTicks
}
