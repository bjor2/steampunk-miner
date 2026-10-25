/**
 * The domain events of the hazard tools' outcomes (ticket 882, PK4c T2), by augmentation, never by
 * editing the kernel's list. Each names the player whose tool acted and the cells it acted on;
 * the authority stamps the tick.
 *
 * - `ScreeShoved`: the Scree Plough queued the scree cell `from` moved to the open cell `to`.
 * - `ShardLooted`: the Shard Tongs lifted the spinecrystal cluster the drill broke at `tx, ty` as
 *   loot, its yield the cell's own.
 * - `VaneRidden`: the Vent Vane turned the shove of the vent at `tx, ty` outward from the core, the
 *   rig coming to rest `tiles` out in `toTx, toTy`.
 */
declare module '../../../systems/authority/domainEvent' {
  interface DomainEventBodies {
    'planet-kit.ScreeShoved': {
      playerId: string
      fromTx: number
      fromTy: number
      toTx: number
      toTy: number
    }
    'planet-kit.ShardLooted': { playerId: string; tx: number; ty: number }
    'planet-kit.VaneRidden': {
      playerId: string
      tx: number
      ty: number
      tiles: number
      toTx: number
      toTy: number
    }
  }
}

export {}
