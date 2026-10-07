/**
 * The `charge_detonated` line both ways (#213): the game writes the detonation's ladder size and,
 * when its blast has one, its radius; a reader takes a line logged before the dynamite sizes,
 * which has neither, as the shipped charge, size 1 of the ladder (K3 #186). That default is the
 * adapter #11 section 1 asks for, so the new fields keep `LOG_SCHEMA_VERSION`.
 */
import type { DomainEventBodies } from '../systems/authority/domainEvent'
import type { RunEventData } from './eventNames'

/** The shipped charge's rung on the ladder (#153), which every older line was. */
const SIZE_BEFORE_THE_LADDER = 1

export interface ChargeDetonation {
  tx: number
  ty: number
  size: number
  /** A render hint only; balance never reads it. */
  radiusMm?: number
}

export function chargeDetonatedDataOf(
  detonated: DomainEventBodies['ChargeDetonated'],
): RunEventData<'charge_detonated'> {
  const { tx, ty, size, radiusMm } = detonated
  return radiusMm === undefined ? { tx, ty, size } : { tx, ty, size, radiusMm }
}

export function readChargeDetonation(data: RunEventData<'charge_detonated'>): ChargeDetonation {
  const { tx, ty, size = SIZE_BEFORE_THE_LADDER, radiusMm } = data
  return radiusMm === undefined ? { tx, ty, size } : { tx, ty, size, radiusMm }
}
