/**
 * Feeds the world-to-screen projector (#208) once per rendered frame, after the camera and every
 * body have moved and right before the pipeline draws, so DOM laid over the picture moves with the
 * frame it covers: no lag frame against the vehicle or the camera. The camera sits relative to the
 * render origin (ticket 339); the frame it publishes is in planet metres, like the points projected.
 */
import { useFrame, type RootState } from '@react-three/fiber'
import { useMemo } from 'react'
import type { OrthographicCamera } from 'three'
import { PROJECTOR_FRAME_PRIORITY } from '../constants/scene'
import type { CameraFrame } from '../systems/render/screenProjection'
import { publishCameraFrame } from '../ui/projection/worldToScreen'
import { renderOriginPresence } from './renderOriginPresence'

export function ScreenProjectorFeed() {
  const frame = useMemo(createCameraFrame, [])
  useFrame((state) => publishCameraFrame(readCameraFrame(state, frame)), PROJECTOR_FRAME_PRIORITY)
  return null
}

function createCameraFrame(): CameraFrame {
  return { centreX: 0, centreY: 0, angle: 0, pixelsPerMetre: 0, widthPixels: 0, heightPixels: 0 }
}

/** The orthographic camera's pose and zoom, written into `out` so the frame allocates nothing. */
function readCameraFrame(state: RootState, out: CameraFrame): CameraFrame {
  const camera = state.camera as OrthographicCamera
  out.centreX = camera.position.x + renderOriginPresence.x
  out.centreY = camera.position.y + renderOriginPresence.y
  out.angle = camera.rotation.z
  out.pixelsPerMetre = camera.zoom
  out.widthPixels = state.size.width
  out.heightPixels = state.size.height
  return out
}
