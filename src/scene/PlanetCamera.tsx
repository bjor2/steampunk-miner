/**
 * The orthographic camera over the vehicle (#13): it follows the vehicle and rolls so local down
 * points down the screen, or stays upright in the fixed-camera mode, offset by the screen shake
 * (zero with shake off). It frames the player's zoom in metres across the short axis (#39), so
 * every resolution shows the same world. The turn and the zoom ease on the render delta, which is
 * presentation only.
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
import { easeViewShortAxis, pixelsPerMetreOf } from '../systems/render/viewZoom'
import { cameraPresence } from './cameraPresence'
import { screenEffects } from './screenEffectsPresence'
import { vehiclePresence } from './vehiclePresence'

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
  camera.position.x = vehiclePresence.x + screenEffects.offsetX
  camera.position.y = vehiclePresence.y + screenEffects.offsetY
  camera.rotation.z = turn.angle
  cameraPresence.localUpScreenAngle = angleOfUp(turn.up) - turn.angle
}

/** Eases toward the chosen zoom and recomputes `camera.zoom` from the canvas, so a resize refits. */
function frameCamera(camera: OrthographicCamera, size: Size, target: number, dt: number): void {
  cameraPresence.viewShortAxisMetres = easeViewShortAxis(
    cameraPresence.viewShortAxisMetres,
    target,
    dt,
  )
  cameraPresence.widthPixels = size.width
  cameraPresence.heightPixels = size.height
  const zoom = pixelsPerMetreOf(size.width, size.height, cameraPresence.viewShortAxisMetres)
  if (camera.zoom === zoom) return
  camera.zoom = zoom
  camera.updateProjectionMatrix()
}
