/**
 * The debug reads and staging #500's layout specs drive the compact HUD with: where the vehicle's
 * body is on screen now, a staged worst case (a full hold and a threat marker, drawn over the
 * run, `systems/views/hudStaging.ts`) and a hint put up next. All presentation: no command, no log
 * line, nothing the digest or a save sees; reachable only through `window.steampunkDebug`, which
 * only a debug run exposes.
 */
import { cameraPresence } from '../scene/cameraPresence'
import { useGameStore } from '../store/gameStore'
import { stageHudForDebug } from '../store/hudStaging'
import { pixelsPerMetreOf } from '../systems/render/viewZoom'
import { vehicleScreenBoxOf, type ScreenBox } from '../systems/views/hudClearView'
import { hudStagingProblemsOf, type HudStaging } from '../systems/views/hudStaging'
import { readFittedScreen } from '../ui/stage/screenFit'
import type { DebugResult } from './debugScreens'

/** The vehicle body's box in the window's CSS px, as the last frame drew it. */
export function vehicleScreenBoxNow(): DebugResult<{ box: ScreenBox }> {
  const { widthPixels, heightPixels, viewShortAxisMetres } = cameraPresence
  if (widthPixels === 0) return { ok: false, problems: ['no frame has been drawn yet'] }
  const box = vehicleScreenBoxOf({
    width: widthPixels,
    height: heightPixels,
    pixelsPerMetre: pixelsPerMetreOf(widthPixels, heightPixels, viewShortAxisMetres),
    fromCentre: { x: cameraPresence.vehicleFromCentreX, y: cameraPresence.vehicleFromCentreY },
    turnRadians: cameraPresence.turnRadians,
  })
  return { ok: true, box: shiftedRight(box, readFittedScreen()?.stage.left ?? 0) }
}

/** Draws the staged worst case over the run; refused whole, with every problem, on a bad value. */
export function stageHudUnlessRefused(staging: unknown): DebugResult {
  const problems = hudStagingProblemsOf(staging)
  if (problems.length > 0) return { ok: false, problems }
  stageHudForDebug(staging as HudStaging)
  return { ok: true }
}

/** Puts the hint up next, with no gap to wait; refused for an id the hint table does not have. */
export function showHintUnlessRefused(hintId: unknown): DebugResult {
  if (typeof hintId !== 'string') return { ok: false, problems: ['hintId must be a string'] }
  try {
    useGameStore.getState().debugShowHint(hintId)
    return { ok: true }
  } catch (error) {
    return { ok: false, problems: [String(error instanceof Error ? error.message : error)] }
  }
}

function shiftedRight(box: ScreenBox, by: number): ScreenBox {
  return { ...box, left: box.left + by, right: box.right + by }
}
