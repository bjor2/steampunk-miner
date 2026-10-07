/**
 * The domain events the drill-gear slice adds (feature-slices.md 3.15), by augmentation, never by
 * editing the kernel's list. Every event names its player: the crumble answers a drill command
 * through an authority reaction, and the corer acts on the authority clock.
 */

declare module '../../../systems/authority/domainEvent' {
  interface DomainEventBodies {
    /** The vibratory bit shook a soft common cell ahead of the bit loose (#162 4.4). */
    'drill-gear.GroundCrumbled': { playerId: string; tx: number; ty: number }
    /** The sampling corer drew a plug from an ore cell ahead; the cell stays in place (#162). */
    'drill-gear.OreSampled': { playerId: string; tx: number; ty: number; oreId: string }
  }
}

export {}
