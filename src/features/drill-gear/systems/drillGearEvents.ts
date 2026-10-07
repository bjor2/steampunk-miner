/**
 * The domain events the drill-gear slice adds (feature-slices.md 3.15), by augmentation, never by
 * editing the kernel's list. Every event names its player: the crumble answers a drill command
 * through an authority reaction, and the auger acts on the authority clock. The corer's plug is the
 * kernel's `OreSampled` (#243).
 */

declare module '../../../systems/authority/domainEvent' {
  interface DomainEventBodies {
    /** The vibratory bit shook a soft common cell ahead of the bit loose (#162 4.4). */
    'drill-gear.GroundCrumbled': { playerId: string; tx: number; ty: number }
    /** The spoil auger queued spoil into a tunnel tile behind the miner (#162). */
    'drill-gear.TunnelBackfilled': { playerId: string; tx: number; ty: number }
  }
}

export {}
