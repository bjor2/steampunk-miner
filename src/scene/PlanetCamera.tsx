/**
 * The orthographic camera over the vehicle (#13): it follows the vehicle and rolls so local down
 * points down the screen, or stays upright in the fixed-camera mode. The turn lives in a ref and
 * is eased on the render delta, which is presentation only.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { useGameStore } from '../store/gameStore'
import { createCameraTurn, stepCameraTurn } from '../systems/render/cameraTurn'
import { vehiclePresence } from './vehiclePresence'

export function PlanetCamera() {
  const turn = useMemo(createCameraTurn, [])
  useFrame(({ camera }, delta) => {
    stepCameraTurn(turn, vehiclePresence, useGameStore.getState().prefs.cameraMode, delta)
    camera.position.x = vehiclePresence.x
    camera.position.y = vehiclePresence.y
    camera.rotation.z = turn.angle
  })
  return null
}
