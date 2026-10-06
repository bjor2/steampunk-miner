/**
 * The base vehicle's `attach` array (docs/standards/feature-slices.md 3.11, #162 TD sockets; K5
 * #188): `partsSidecar.ts` checks the shape of any sidecar's attach points, and this module adds
 * the vehicle's own rule. The coverage rule reads these points, so the base vehicle must place
 * every `vehicle-attach` id and nothing else. Render-only, like the registry.
 */
import { ATTACH_IDS, isAttachId } from '../registries/vehicleAttach'
import type { PartsSidecar } from './partsSidecar'

/** The asset whose sidecar holds the attach points: the base vehicle (#162). */
export const ATTACH_ASSET_ID = 'vehicle'

/** Why the base vehicle's attach array breaks the vehicle-attach table; empty for any other asset. */
export function vehicleAttachProblems(assetId: string, sidecar: PartsSidecar): string[] {
  if (assetId !== ATTACH_ASSET_ID) return []
  if (sidecar.attach === undefined) return ['the base vehicle needs an attach array']
  return [...missingAttachProblems(sidecar), ...unknownAttachProblems(sidecar)]
}

/** The point ids the sidecar places, for the attach coverage rule. */
export function attachIdsOf(sidecar: PartsSidecar): string[] {
  return (sidecar.attach ?? []).map((point) => point.id)
}

function missingAttachProblems(sidecar: PartsSidecar): string[] {
  const placed = attachIdsOf(sidecar)
  return ATTACH_IDS.filter((id) => !placed.includes(id)).map((id) => `attach "${id}" is missing`)
}

function unknownAttachProblems(sidecar: PartsSidecar): string[] {
  return attachIdsOf(sidecar)
    .filter((id) => !isAttachId(id))
    .map((id) => `attach "${id}" is not a vehicle attach id`)
}
