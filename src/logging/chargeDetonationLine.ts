/**
 * The `charge_detonated` line both ways (#213): the game writes the detonation's ladder size and,
 * when its blast has one, its radius; a reader takes a line logged before the dynamite sizes,
 * which has neither, as the shipped charge, size 1 of the ladder (K3 #186). The game also writes
 * what fired it, its fuse or #149's plunger (K8 #218); an older line, from before the plunger, was
 * its fuse. Those defaults are the adapter #11 section 1 asks for, so the new fields keep
 * `LOG_SCHEMA_VERSION`.
 */
import type { DetonationTrigger, DomainEventBodies } from '../systems/authority/domainEvent'
import type { RunEventData } from './eventNames'

/** The shipped charge's rung on the ladder (#153), which every older line was. */
const SIZE_BEFORE_THE_LADDER = 1
/** Every charge blew on its fuse before the plunger (#149). */
const TRIGGER_BEFORE_THE_PLUNGER: DetonationTrigger = 'fuse'

export interface ChargeDetonation {
  tx: number
  ty: number
  size: number
  /** A render hint only; balance never reads it. */
  radiusMm?: number
  by: DetonationTrigger
}

export function chargeDetonatedDataOf(
  detonated: DomainEventBodies['ChargeDetonated'],
): RunEventData<'charge_detonated'> {
  const { tx, ty, size, radiusMm, by } = detonated
  return radiusMm === undefined ? { tx, ty, size, by } : { tx, ty, size, radiusMm, by }
}

export function readChargeDetonation(data: RunEventData<'charge_detonated'>): ChargeDetonation {
  const { tx, ty, size = SIZE_BEFORE_THE_LADDER, radiusMm, by = TRIGGER_BEFORE_THE_PLUNGER } = data
  return radiusMm === undefined ? { tx, ty, size, by } : { tx, ty, size, radiusMm, by }
}
