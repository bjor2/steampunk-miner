/**
 * The vehicle's programmatic placeholder art (#13): layered flat parts in brass, copper and iron,
 * each drawn at the variant of its visual tier, so an upgrade threshold shows on the vehicle
 * (37.7). The tier is the authority replica's (#7: derived from the levels, never decided here).
 * Drawn inside the vehicle's body group, so it turns with the body.
 */
import { useMemo } from 'react'
import { useGameStore } from '../store/gameStore'
import { vehicleShapesForTier, type DrawnShape } from '../systems/render/vehiclePlaceholder'

/** Parts sit just in front of the tiles; each layer a hair nearer the camera than the last. */
const BASE_Z = 0.1
const Z_PER_LAYER = 0.01
const DISC_SEGMENTS = 20

export function VehiclePlaceholder() {
  const visualTier = useGameStore((state) => state.vehicle.visualTier)
  const shapes = useMemo(() => vehicleShapesForTier(visualTier), [visualTier])
  return (
    <>
      {shapes.map((shape) => (
        <VehicleShapeMesh key={shape.key} shape={shape} />
      ))}
    </>
  )
}

function VehicleShapeMesh({ shape }: { shape: DrawnShape }) {
  const [width, height] = shape.size
  const [x, y] = shape.offset
  const z = BASE_Z + shape.layer * Z_PER_LAYER
  return (
    <mesh position={[x, y, z]}>
      {shape.shape === 'disc' ? (
        <circleGeometry args={[width / 2, DISC_SEGMENTS]} />
      ) : (
        <planeGeometry args={[width, height]} />
      )}
      <meshBasicMaterial color={shape.colour} />
    </mesh>
  )
}
