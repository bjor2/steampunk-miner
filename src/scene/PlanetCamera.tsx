/**
 * The orthographic camera over the vehicle (#13): it follows the vehicle (or eases to where a dock
 * building stages it, #170) and rolls so local down
 * points down the screen, or stays upright in the fixed-camera mode, offset by the screen shake
 * (zero with shake off). It frames the player's zoom in metres across the short axis (#39), so
 * every resolution shows the same world, capped on wide screens (#173). The turn and the zoom ease on the render delta, which is
 * presentation only. It sits relative to the render origin, like the world root (ticket 339).
 */
import { useFrame, type Size } from '@react-three/fiber'
import { useMemo } from 'react'
import type { Camera, OrthographicCamera } from 'three'
import { useGameStore } from '../store/gameStore'
import {
  angleOfUp,
  createCameraTurn,
  stepCameraTurn,
  type CameraTurn,
} from '../systems/render/cameraTurn'
import {
  easeViewShortAxis,
  pixelsPerMetreOf,
  shownViewShortAxisOf,
} from '../systems/render/viewZoom'
import { cameraPresence } from './cameraPresence'
import { renderOriginPresence } from './renderOriginPresence'
import { screenEffects } from './screenEffectsPresence'
import { vehiclePresence } from './vehiclePresence'
import { vehicleStagePresence } from './vehicleStage'

export function PlanetCamera() {
  const turn = useMemo(createCameraTurn, [])
  useFrame(({ camera, size }, delta) => {
    const { prefs } = useGameStore.getState()
    stepCameraTurn(turn, vehiclePresence, prefs.cameraMode, delta)
    placeCamera(camera, turn)
    frameCamera(camera as OrthographicCamera, size, prefs.viewShortAxisMetres, delta)
  })
  return null
}

function placeCamera(camera: Camera, turn: CameraTurn): void {
  const lookAtX = lookAtOf(vehiclePresence.x, vehicleStagePresence.cameraX)
  const lookAtY = lookAtOf(vehiclePresence.y, vehicleStagePresence.cameraY)
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
 * Eases toward the chosen zoom, held under the screen shape's cap (#173), and recomputes
 * `camera.zoom` from the canvas, so a resize refits.
 */
function frameCamera(camera: OrthographicCamera, size: Size, chosen: number, dt: number): void {
  cameraPresence.viewShortAxisMetres = easeViewShortAxis(
    cameraPresence.viewShortAxisMetres,
    shownViewShortAxisOf(size.width, size.height, chosen),
    dt,
  )
  cameraPresence.widthPixels = size.width
  cameraPresence.heightPixels = size.height
  const zoom = pixelsPerMetreOf(size.width, size.height, cameraPresence.viewShortAxisMetres)
  if (camera.zoom === zoom) return
  camera.zoom = zoom
  camera.updateProjectionMatrix()
}
