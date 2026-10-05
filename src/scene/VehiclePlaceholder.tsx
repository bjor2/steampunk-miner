/**
 * The vehicle's programmatic placeholder art (#13): layered flat parts in brass, copper and iron,
 * more of them at each visual tier, so an upgrade threshold shows on the vehicle (37.7). Drawn
 * inside the vehicle's body group, so it turns with the body.
 */
import { useMemo } from 'react'
import { useGameStore } from '../store/gameStore'
import { vehiclePartsForTier, type VehiclePart } from '../systems/render/vehiclePlaceholder'

/** Parts sit just in front of the tiles; each layer a hair nearer the camera than the last. */
const BASE_Z = 0.1
const Z_PER_LAYER = 0.01
const DISC_SEGMENTS = 20

export function VehiclePlaceholder() {
  const visualTier = useGameStore((state) => state.vehicle.visualTier)
  const parts = useMemo(() => vehiclePartsForTier(visualTier), [visualTier])
  return (
    <>
      {parts.map((part) => (
        <VehiclePartMesh key={part.id} part={part} />
      ))}
    </>
  )
}

function VehiclePartMesh({ part }: { part: VehiclePart }) {
  const [width, height] = part.size
  const [x, y] = part.offset
  const z = BASE_Z + part.layer * Z_PER_LAYER
  return (
    <mesh position={[x, y, z]}>
      {part.shape === 'disc' ? (
        <circleGeometry args={[width / 2, DISC_SEGMENTS]} />
      ) : (
        <planeGeometry args={[width, height]} />
      )}
      <meshBasicMaterial color={part.colour} />
    </mesh>
  )
}
