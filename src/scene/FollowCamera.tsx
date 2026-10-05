/**
 * Keeps the orthographic camera over the vehicle. Position only: rotating the view so local down
 * points down the screen, and the fixed-camera option, are Build 5's (#22, #13).
 */
import { useFrame } from '@react-three/fiber'
import { vehiclePresence } from './vehiclePresence'

export function FollowCamera() {
  useFrame(({ camera }) => {
    camera.position.x = vehiclePresence.x
    camera.position.y = vehiclePresence.y
  })
  return null
}
