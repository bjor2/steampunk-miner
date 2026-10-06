/**
 * The Upgrade bay's live vehicle preview (#44, #39): a scene of its own with the player's vehicle
 * on a lit plinth, drawn from the run vehicle's parts at the tier it owns. Its orthographic camera
 * frames the visual vehicle at 60% of the panel height. There is no world, no camera roll and no
 * physics; it reads only the preview view model, so it can never change state or the digest.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { CAMERA_POSITION } from '../constants/scene'
import type { UpgradePreview } from '../systems/views/upgradePreview'
import {
  previewBoundsOf,
  previewCentreOf,
  previewVehicleShareOf,
  previewZoomOf,
  type PreviewBounds,
} from '../systems/render/vehiclePreviewLook'
import { previewPresence } from './previewPresence'
import { GhostVehicle, PreviewVehicle } from './PreviewVehicle'
import { SHIPPED_ART } from './shippedArt'

/** Placeholders tuned by eye in `npm run dev`: a warm key light from above left on dark enamel. */
const KEY_LIGHT = { position: [-3, 4, 6] as const, intensity: 2.2, colour: '#ffe2b0' }
const AMBIENT_INTENSITY = 0.6
const PLINTH = { colour: '#6b5a35', height: 0.15, overhang: 0.3 }
/** The bay's dark enamel behind the plinth, so the world never shows through the preview. */
const BACKDROP_COLOUR = '#17120f'

export function VehiclePreviewScene({ preview }: { preview: UpgradePreview }) {
  const bounds = useMemo(() => previewBoundsOf(SHIPPED_ART, preview.ownedTier), [preview.ownedTier])
  return (
    <Canvas flat orthographic camera={{ position: [...CAMERA_POSITION] }}>
      <color attach="background" args={[BACKDROP_COLOUR]} />
      <PreviewCamera bounds={bounds} />
      <ambientLight intensity={AMBIENT_INTENSITY} />
      <directionalLight
        position={[...KEY_LIGHT.position]}
        intensity={KEY_LIGHT.intensity}
        color={KEY_LIGHT.colour}
      />
      <Plinth bounds={bounds} />
      <PreviewVehicle
        visualTier={preview.ownedTier}
        highlight={preview.highlight}
        installing={preview.installing}
      />
      {preview.ghostTier !== null && <GhostVehicle visualTier={preview.ghostTier} />}
    </Canvas>
  )
}

/** Frames the vehicle from the panel's size every frame, and reports the framing (#39). */
function PreviewCamera({ bounds }: { bounds: PreviewBounds }) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  useEffect(() => clearFraming, [])
  useFrame(() => {
    const panel = { widthPixels: size.width, heightPixels: size.height }
    const zoom = previewZoomOf(bounds, panel)
    const [x, y] = previewCentreOf(bounds)
    camera.position.set(x, y, CAMERA_POSITION[2])
    camera.zoom = zoom
    camera.updateProjectionMatrix()
    reportFraming(bounds, panel.widthPixels, panel.heightPixels, zoom)
  })
  return null
}

function reportFraming(bounds: PreviewBounds, width: number, height: number, zoom: number): void {
  previewPresence.panelWidthPixels = width
  previewPresence.panelHeightPixels = height
  previewPresence.pixelsPerMetre = zoom
  previewPresence.vehicleShare = previewVehicleShareOf(bounds, zoom, height)
}

function clearFraming(): void {
  reportFraming({ left: 0, bottom: 0, right: 0, top: 0 }, 0, 0, 0)
}

/** The brass plinth the vehicle stands on, a little wider than the vehicle. */
function Plinth({ bounds }: { bounds: PreviewBounds }) {
  const width = bounds.right - bounds.left + 2 * PLINTH.overhang
  const [x] = previewCentreOf(bounds)
  return (
    <mesh position={[x, bounds.bottom - PLINTH.height / 2, -0.1]}>
      <planeGeometry args={[width, PLINTH.height]} />
      <meshStandardMaterial color={PLINTH.colour} roughness={0.4} metalness={0.6} />
    </mesh>
  )
}
