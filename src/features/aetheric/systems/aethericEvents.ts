/**
 * The domain event and refusal reason the aetheric lane adds (feature-slices.md 3.15), by
 * augmentation, never by editing the kernel's lists. `power-up-core` already logs every use as
 * `power_up_used`; the lock on #245 wants one `aetheric.*` event beside it saying what the use did.
 *
 * The event names its player: the whistle's act resolves on the authority clock after its wind-up,
 * whose events carry no command stamp.
 */
import type { DomainEventBodies } from '../../../systems/authority/domainEvent'

declare module '../../../systems/authority/domainEvent' {
  interface DomainEventBodies {
    /**
     * The resonance whistle sounded on tile (`tx`, `ty`): hunters within `reachTiles` of it path
     * there for `durationTicks`, and `energy` quanta left the tank (#262).
     */
    'aetheric.WhistleSounded': {
      playerId: string
      itemId: string
      tx: number
      ty: number
      reachTiles: number
      durationTicks: number
      energy: number
    }
  }
}

export type WhistleSounded = DomainEventBodies['aetheric.WhistleSounded']

/** Why a whistle press did not sound (`power_up_refused.reason`): the tank cannot pay the blow. */
export const ENERGY_SHORT = 'aetheric.energy_short'

export function whistleSoundedOf(body: WhistleSounded) {
  return { type: 'aetheric.WhistleSounded' as const, ...body }
}
