/**
 * The orthographic camera over the vehicle (#13): it follows the vehicle (or eases to where a dock
 * building stages it, #170) and rolls so local down
 * points down the screen, or stays upright in the fixed-camera mode, offset by the screen shake
 * (zero with shake off). It frames the player's zoom in metres across the short axis (#39), so
 * every resolution shows the same world, capped on wide screens (#173). At speed it leans ahead
 * along the drive and pulls back past the player's zoom, up to that cap, so 1 s of ground stays in
 * view ahead (the #316 camera lock, ticket 338). The turn, the lean and the zoom ease on the render
 * delta, which is presentation only. It sits relative to the render origin, like the world root
 * (ticket 339).
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
  leadOffsetOf,
  stepSpeedFraming,
  type SpeedFraming,
} from '../systems/render/speedFraming'
import {
  easeViewShortAxis,
  maxViewShortAxisOf,
  pixelsPerMetreOf,
  shownViewShortAxisOf,
} from '../systems/render/viewZoom'
import { cameraPresence } from './cameraPresence'
import { drillPresence } from './drillPresence'
import { motionPresence } from './motionPresence'
import { renderOriginPresence } from './renderOriginPresence'
import { screenEffects } from './screenEffectsPresence'
import { vehiclePresence } from './vehiclePresence'
import { vehicleStagePresence } from './vehicleStage'

/** The player's chosen zoom as it eases, before the pull-back for speed. */
interface PlayerZoom {
  shownMetres: number
}

export function PlanetCamera() {
  const turn = useMemo(createCameraTurn, [])
  const framing = useMemo(createSpeedFraming, [])
  const zoom = useMemo<PlayerZoom>(() => ({ shownMetres: VIEW_SHORT_AXIS_DEFAULT_M }), [])
  useFrame(({ camera, size }, delta) => {
    const { prefs } = useGameStore.getState()
    stepCameraTurn(turn, vehiclePresence, prefs.cameraMode, delta)
    stepSpeedFraming(framing, motionPresence.velocity, drillPresence.ahead, delta)
    frameCamera(camera as OrthographicCamera, size, zoom, prefs.viewShortAxisMetres, framing, delta)
    placeCamera(camera, turn, framing)
  })
  return null
}

/** Over the vehicle, moved ahead along the drive by the lean, so the rig sits toward the trailing edge. */
function placeCamera(camera: Camera, turn: CameraTurn, framing: SpeedFraming): void {
  const shortAxis = cameraPresence.viewShortAxisMetres
  const lookAtX = lookAtOf(
    vehiclePresence.x + leadOffsetOf(framing, shortAxis, 'x'),
    vehicleStagePresence.cameraX,
  )
  const lookAtY = lookAtOf(
    vehiclePresence.y + leadOffsetOf(framing, shortAxis, 'y'),
    vehicleStagePresence.cameraY,
  )
  camera.position.x = lookAtX - renderOriginPresence.x + screenEffects.offsetX
  camera.position.y = lookAtY - renderOriginPresence.y + screenEffects.offsetY
  camera.rotation.z = turn.angle
  cameraPresence.localUpScreenAngle = angleOfUp(turn.up) - turn.angle
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
  const cap = maxViewShortAxisOf(size.width, size.height)
  cameraPresence.viewShortAxisMetres = framedShortAxisOf(framing, zoom.shownMetres, cap)
  cameraPresence.feltSpeedCellsPerSecond = framing.feltSpeed
  cameraPresence.leadShare = framing.leadShare
  cameraPresence.widthPixels = size.width
  cameraPresence.heightPixels = size.height
}

function fitCameraZoom(camera: OrthographicCamera, size: Size): void {
  const zoom = pixelsPerMetreOf(size.width, size.height, cameraPresence.viewShortAxisMetres)
  if (camera.zoom === zoom) return
  camera.zoom = zoom
  camera.updateProjectionMatrix()
}
