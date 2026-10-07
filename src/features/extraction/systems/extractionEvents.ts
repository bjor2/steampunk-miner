/**
 * The domain event the extraction slice adds (feature-slices.md 3.15), by augmentation, never by
 * editing the kernel's list, and the body its rules build. It names its player: a drain resolves
 * on the authority clock, whose events carry no command stamp.
 */
import type { Money } from '../../../systems/money'
import { toCanonical } from '../../../systems/money'

declare module '../../../systems/authority/domainEvent' {
  interface DomainEventBodies {
    /**
     * An income item moved ore into the hold (#162 4.5 `drain_yield`): the value of this use's
     * units, and the share of the trip cap the trip has used after it, as a canonical decimal.
     */
    'extraction.DrainYielded': {
      playerId: string
      itemId: string
      value: string
      tripCapFraction: string
      /** The band the cap was read at: the band of the tile the use was pressed on. */
      band: number
      cells: number
      units: number
    }
  }
}

export interface DrainYield {
  playerId: string
  itemId: string
  value: Money
  tripCapFraction: Money
  band: number
  cells: number
  units: number
}

export function drainYieldedOf(drain: DrainYield) {
  return {
    type: 'extraction.DrainYielded' as const,
    ...drain,
    value: toCanonical(drain.value),
    tripCapFraction: toCanonical(drain.tripCapFraction),
  }
}
