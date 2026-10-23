/**
 * The hazard strip on desktop (spec #678, ticket 769; G&V's warnings in the GD lock of 23 Oct): the
 * track stays on the side nearest the danger, laid out from the rig along the drive toward the
 * leading edge, and stays inside the play area. The play area is the stage the HUD lays out in
 * (already narrowed by a docked panel, so the panel never covers the strip), less the strip's top
 * box and the tool tray's row at the foot, each with its margin. Where the full track would run
 * past that box, it is shortened to end at the box's edge; the pips keep their share of the track,
 * so a pip still sits at its share of the 2 s ahead.
 */
import type { DesignTokens } from './designSystem'
import { DESIGN_TOKENS } from './designSystem'
import { hazardStripReachOf, type HazardStripReach } from './hazardStripPlace'
import type { ScreenSize } from './hudClearView'

/** A share this close to 0 is a cardinal drive's rounding, not a way along. */
const NO_SHARE = 1e-9

/**
 * The desktop track for a drive `driveAngle` radians counter-clockwise from screen up, written into
 * `out` so the per-frame draw allocates nothing: the screen's reach, its length held to the room
 * left between its near end and the play area's edge (never below 0).
 */
export function hazardStripDesktopReachInto(
  out: HazardStripReach,
  screen: ScreenSize,
  driveAngle: number,
  tokens: DesignTokens = DESIGN_TOKENS,
): HazardStripReach {
  const full = hazardStripReachOf(screen)
  const room = playRoomAlong(screen, -Math.sin(driveAngle), -Math.cos(driveAngle), tokens)
  out.inner = full.inner
  out.length = Math.max(0, Math.min(full.length, room - full.inner))
  return out
}

/** How far from the screen's middle along (dx, dy), y down, the play area's border lies. */
function playRoomAlong(screen: ScreenSize, dx: number, dy: number, tokens: DesignTokens): number {
  const { marginPx, strip, toolSlots } = tokens.layout
  const top = strip.heightPx.desktop + 2 * marginPx
  const foot = toolSlots.cellPx.desktop + 2 * marginPx
  const roomX = screen.width / 2 - marginPx
  const roomY = dy < 0 ? screen.height / 2 - top : screen.height / 2 - foot
  return Math.max(0, Math.min(reachAlong(dx, roomX), reachAlong(dy, roomY)))
}

function reachAlong(share: number, room: number): number {
  return Math.abs(share) < NO_SHARE ? Infinity : room / Math.abs(share)
}
