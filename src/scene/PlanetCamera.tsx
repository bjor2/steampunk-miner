/**
 * The orthographic camera over the vehicle (#13): it follows the vehicle and rolls so local down
 * points down the screen, or stays upright in the fixed-camera mode, offset by the screen shake
 * (zero with shake off). The turn lives in a ref and is eased on the render delta, which is
 * presentation only.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { useGameStore } from '../store/gameStore'
import { angleOfUp, createCameraTurn, stepCameraTurn } from '../systems/render/cameraTurn'
import { cameraPresence } from './cameraPresence'
import { screenEffects } from './screenEffectsPresence'
import { vehiclePresence } from './vehiclePresence'

export function PlanetCamera() {
  const turn = useMemo(createCameraTurn, [])
  useFrame(({ camera }, delta) => {
    stepCameraTurn(turn, vehiclePresence, useGameStore.getState().prefs.cameraMode, delta)
    camera.position.x = vehiclePresence.x + screenEffects.offsetX
    camera.position.y = vehiclePresence.y + screenEffects.offsetY
    camera.rotation.z = turn.angle
    cameraPresence.localUpScreenAngle = angleOfUp(turn.up) - turn.angle
  })
  return null
}
