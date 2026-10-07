/**
 * The `chargeBlastCue` provider (#213 seam, wired by #215): a detonation kicks the local player by
 * its size and radius through `blastCueOf`. A detonation that carries no radius (none since #213,
 * but the field is optional) takes its size's radius from the kernel's ladder, never a copy.
 */
import { chargeRadiusMm } from '../../../../systems/economy/chargeSizes'
import type {
  ChargeBlastCueProvider,
  ChargeDetonatedEvent,
} from '../../../../systems/registries/chargeBlastCue'
import { blastCueOf } from './blastCue'

export const DYNAMITE_BLAST_CUE: ChargeBlastCueProvider = {
  id: 'dynamite-visuals.blast-cue',
  kickOf: (detonated, distanceMm) =>
    blastCueOf(detonated.size, blastRadiusMmOf(detonated), distanceMm),
}

export function blastRadiusMmOf(detonated: ChargeDetonatedEvent): number {
  return detonated.radiusMm ?? chargeRadiusMm(detonated.size)
}
