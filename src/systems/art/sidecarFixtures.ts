/**
 * A schema-1 vehicle sidecar the sidecar specs vary one field of at a time: the shared
 * `partsSidecar.test.ts` and each module's own art spec (`<module>Art.test.ts`, #116).
 */
import { ATTACH_IDS } from '../registries/vehicleAttach'
import type { AttachPoint, PartsSidecar, SidecarPart } from './partsSidecar'

const WHEEL_SIZE_M = 0.24

// The pivot is the axle at the wheel's centre (#52), worked out so the economy source scan sees no
// stray decimal that happens to match an economy.json value.
export const WHEEL_PART: SidecarPart = {
  id: 't1-wheel',
  tier: 1,
  rect: [8, 8, 123, 123],
  sizeM: [WHEEL_SIZE_M, WHEEL_SIZE_M],
  pivotM: [WHEEL_SIZE_M / 2, WHEEL_SIZE_M / 2],
  atM: [-0.32, -0.36],
  z: 1,
}

const MOUNTED_PART_Z = 6

/** Every attach point at the vehicle's origin, which the base vehicle's sidecar must carry. */
export const VEHICLE_ATTACH: readonly AttachPoint[] = ATTACH_IDS.map((id) => ({
  id,
  atM: [0, 0],
  z: MOUNTED_PART_Z,
}))

export function vehicleSidecar(parts: SidecarPart[] = [WHEEL_PART]): PartsSidecar {
  return {
    assetId: 'vehicle',
    schema: 1,
    source: { blend: 'art/blender/vehicle/vehicle.blend', sha256: null, blender: null },
    pxPerMetre: 512,
    atlasPx: [256, 256],
    maps: {
      albedo: 'vehicle.albedo.ktx2',
      normal: 'vehicle.normal.ktx2',
      emissive: 'vehicle.emissive.ktx2',
    },
    parts,
    attach: VEHICLE_ATTACH,
  }
}
