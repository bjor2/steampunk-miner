/**
 * Hands the tick dilation watch's judgement to the store once a frame (ticket 480), so the HUD
 * shows the slow-device chip while the frame cap keeps dropping ticks. The watch itself lives in
 * the live fixed step; the store changes only when the judgement does.
 */
import { useFrame } from '@react-three/fiber'
import { readTickDilation } from '../physics/liveFixedStep'
import { useGameStore } from '../store/gameStore'

export function SlowDeviceWatch() {
  useFrame(followSlowDevice)
  return null
}

function followSlowDevice(): void {
  useGameStore.getState().followSlowDevice(readTickDilation())
}
