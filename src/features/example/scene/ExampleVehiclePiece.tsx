/**
 * The example slice's vehicle piece (ticket 235): the #166 echo sounder horn on its own point,
 * `hull.roof.aft` (#162 mortar pick), hung there only while
 * `steampunkDebug.features.example.mountTestPiece()` holds it on, for the kernel e2e that shows a
 * registered piece on the car. No player control mounts it.
 */
import { MountedParts } from '../../../scene/MountedParts'
import type { PartMount } from '../../../systems/render/mountedPartLook'
import { useTestPieceStore } from '../store/testPieceStore'

export const EXAMPLE_VEHICLE_PIECE_ID = 'example.test-piece'

const TEST_PIECE: PartMount = {
  assetId: 'vehicle-item-power-echo-sounder',
  attachId: 'hull.roof.aft',
}

export function ExampleVehiclePiece() {
  const isMounted = useTestPieceStore((state) => state.isMounted)
  return isMounted ? <MountedParts {...TEST_PIECE} /> : null
}
