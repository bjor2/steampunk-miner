/**
 * The orthographic camera over the vehicle (#13): it follows the vehicle (or eases to where a dock
 * building stages it, #170) and rolls so local down
 * points down the screen, or stays upright in the fixed-camera mode, offset by the screen shake
 * (zero with shake off). It frames the player's zoom in metres across the short axis (#39), so
 * every resolution shows the same world, capped on wide screens (#173). At speed it leans ahead
 * along the drive and pulls back past the player's zoom, up to that cap, so 1 s of ground stays in
 * view ahead (the #316 camera lock, ticket 338); below 3 m/s it follows an eased copy of the body
 * so body jitter does not shake the view (ticket 515). The turn, the lean, the ease and the zoom
 * run on the render delta, which is presentation only. It sits relative to the render origin, like
 * the world root (ticket 339). The zoom is metres down the screen's height in either orientation,
 * so a portrait screen shows desktop's vertical metres and narrows across, and the lean across it
 * is scaled by its half width (ticket 484).
 */
import { useFrame, type Size } from '@react-three/fiber'
import { useMemo } from 'react'
import type { Camera, OrthographicCamera } from 'three'
import { VIEW_SHORT_AXIS_DEFAULT_M } from '../constants/scene'
import { useGameStore } from '../store/gameStore'
import {
  angleOfUp,
  createCameraTurn,
  stepCameraTurn,
  type CameraTurn,
} from '../systems/render/cameraTurn'
import {
  createSpeedFraming,
  framedShortAxisOf,
  leadOffsetInto,
  stepSpeedFraming,
  type FramedView,
  type SpeedFraming,
} from '../systems/render/speedFraming'
import type { Vector2 } from '../systems/vehicle/localFrame'
import {
  easeViewShortAxis,
  maxViewVerticalOf,
  pixelsPerMetreOf,
  shownViewShortAxisOf,
  viewHorizontalMetresOf,
} from '../systems/render/viewZoom'
import { followLagOf } from '../systems/render/cameraFollow'
import { cameraPresence } from './cameraPresence'
import { drillPresence } from './drillPresence'
import { createFollowedVehicle, followVehicle } from './followedVehicle'
import { motionPresence } from './motionPresence'
import { renderOriginPresence } from './renderOriginPresence'
import { screenEffects } from './screenEffectsPresence'
import { vehiclePresence } from './vehiclePresence'
import { vehicleStagePresence } from './vehicleStage'

/** The player's chosen zoom as it eases, before the pull-back for speed. */
interface PlayerZoom {
  shownMetres: number
}

/** Per-frame scratch for the lean (CLAUDE.md frame rules: no allocation a frame). */
interface LeanScratch {
  view: FramedView
  lead: Vector2
}

function createLeanScratch(): LeanScratch {
  return {
    view: { verticalMetres: 0, horizontalMetres: 0, turnRadians: 0 },
    lead: { x: 0, y: 0 },
  }
}

export function PlanetCamera() {
  const turn = useMemo(createCameraTurn, [])
  const framing = useMemo(createSpeedFraming, [])
  const zoom = useMemo<PlayerZoom>(() => ({ shownMetres: VIEW_SHORT_AXIS_DEFAULT_M }), [])
  const lean = useMemo(createLeanScratch, [])
  const followed = useMemo(createFollowedVehicle, [])
  useFrame(({ camera, size }, delta) => {
    const { prefs } = useGameStore.getState()
    stepCameraTurn(turn, vehiclePresence, prefs.cameraMode, delta)
    stepSpeedFraming(framing, motionPresence.velocity, drillPresence.ahead, delta)
    frameCamera(camera as OrthographicCamera, size, zoom, prefs.viewShortAxisMetres, framing, delta)
    const anchor = followVehicle(followed, vehiclePresence, framing.feltSpeed, delta)
    placeCamera(camera, turn, anchor, leanOffsetOf(lean, turn, framing))
  })
  return null
}

/** The lean on the view this frame framed, turned with the camera (ticket 484). */
function leanOffsetOf(lean: LeanScratch, turn: CameraTurn, framing: SpeedFraming): Vector2 {
  const { view } = lean
  view.verticalMetres = cameraPresence.viewShortAxisMetres
  view.horizontalMetres = cameraPresence.viewHorizontalMetres
  view.turnRadians = turn.angle
  return leadOffsetInto(lean.lead, framing, view)
}

/**
 * Over the vehicle (eased below 3 m/s, ticket 515), moved ahead along the drive by the lean, so the
 * rig sits toward the trailing edge.
 */
function placeCamera(camera: Camera, turn: CameraTurn, anchor: Vector2, lead: Vector2): void {
  const lookAtX = lookAtOf(anchor.x + lead.x, vehicleStagePresence.cameraX)
  const lookAtY = lookAtOf(anchor.y + lead.y, vehicleStagePresence.cameraY)
  camera.position.x = lookAtX - renderOriginPresence.x + screenEffects.offsetX
  camera.position.y = lookAtY - renderOriginPresence.y + screenEffects.offsetY
  camera.rotation.z = turn.angle
  cameraPresence.localUpScreenAngle = angleOfUp(turn.up) - turn.angle
  cameraPresence.vehicleFromCentreX = vehiclePresence.x - lookAtX
  cameraPresence.vehicleFromCentreY = vehiclePresence.y - lookAtY
  cameraPresence.turnRadians = turn.angle
  cameraPresence.followLagMetres = followLagOf(anchor, vehiclePresence)
}

/** The vehicle, or on the way to where a dock building stages the camera (#170 showcase). */
function lookAtOf(vehicle: number, staged: number): number {
  return vehicle + (staged - vehicle) * vehicleStagePresence.cameraWeight
}

/**
 * Eases toward the chosen zoom, held under the screen shape's cap (#173), pulls back for speed
 * before that cap (ticket 338), and recomputes `camera.zoom` from the canvas, so a resize refits.
 */
function frameCamera(
  camera: OrthographicCamera,
  size: Size,
  zoom: PlayerZoom,
  chosen: number,
  framing: SpeedFraming,
  dt: number,
): void {
  easePlayerZoom(zoom, size, chosen, dt)
  showFraming(size, zoom, framing)
  fitCameraZoom(camera, size)
}

function easePlayerZoom(zoom: PlayerZoom, size: Size, chosen: number, dt: number): void {
  const target = shownViewShortAxisOf(size.width, size.height, chosen)
  zoom.shownMetres = easeViewShortAxis(zoom.shownMetres, target, dt)
}

function showFraming(size: Size, zoom: PlayerZoom, framing: SpeedFraming): void {
  const cap = maxViewVerticalOf(size.width, size.height)
  const vertical = framedShortAxisOf(framing, zoom.shownMetres, cap)
  cameraPresence.viewShortAxisMetres = vertical
  cameraPresence.viewHorizontalMetres = viewHorizontalMetresOf(size.width, size.height, vertical)
  cameraPresence.feltSpeedCellsPerSecond = framing.feltSpeed
  cameraPresence.leadShare = framing.leadShare
  cameraPresence.sideLeadShare = framing.sideLeadShare
  cameraPresence.widthPixels = size.width
  cameraPresence.heightPixels = size.height
}

function fitCameraZoom(camera: OrthographicCamera, size: Size): void {
  const zoom = pixelsPerMetreOf(size.height, cameraPresence.viewShortAxisMetres)
  if (camera.zoom === zoom) return
  camera.zoom = zoom
  camera.updateProjectionMatrix()
}
