/**
 * Screen shake and flashes (#13 VFX, #33 switches): kicks the shared screen effects on each
 * feedback cue, steps them on the render delta through the player's switches, and draws the flash
 * as a warm veil in front of the world. The camera adds the shake offset (`PlanetCamera`).
 * Presentation only: it never writes the store or submits.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { Mesh, MeshBasicMaterial } from 'three'
import { CAMERA_POSITION } from '../constants/scene'
import { listenForFeedback } from '../store/feedbackBroadcast'
import { useGameStore } from '../store/gameStore'
import { kickScreen, stepScreenEffects } from '../systems/feedback/screenEffects'
import { screenEffects } from './screenEffectsPresence'

/** Between the world and the camera; wide enough for any screen at the camera's zoom. */
const VEIL_Z = CAMERA_POSITION[2] / 2
const VEIL_SIZE_METRES = 400
const VEIL_COLOUR = '#fff1d6'

export function ScreenFeedback() {
  const veil = useRef<Mesh>(null)
  useEffect(
    () => listenForFeedback((cue) => kickScreen(screenEffects, cue, useGameStore.getState().prefs)),
    [],
  )
  useFrame(({ camera }, delta) => {
    stepScreenEffects(screenEffects, delta, useGameStore.getState().prefs)
    if (veil.current !== null) drawVeil(veil.current, camera.position.x, camera.position.y)
  })
  return (
    <mesh ref={veil} renderOrder={10} visible={false}>
      <planeGeometry args={[VEIL_SIZE_METRES, VEIL_SIZE_METRES]} />
      <meshBasicMaterial color={VEIL_COLOUR} transparent depthTest={false} depthWrite={false} />
    </mesh>
  )
}

function drawVeil(veil: Mesh, x: number, y: number): void {
  veil.visible = screenEffects.flash > 0
  veil.position.set(x, y, VEIL_Z)
  ;(veil.material as MeshBasicMaterial).opacity = screenEffects.flash
}
