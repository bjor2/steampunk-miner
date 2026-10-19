import { beforeAll, describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  cutSpeedSlab,
  CUTTING_PLAYER,
  SLAB_TILES,
  slabRigOf,
  strideOfSpeed,
  type SlabRun,
} from '../../../systems/authority/speedSlabFixtures'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { speciesIdAt } from './materialFixtures'

// The codex half of ticket 560's event rule (HS on #551): with every slice loaded, the speed-
// scaling slab cut at 84 and 840 m/s meets its ore once a cell. The first-ore records (contact
// and discovery of the ore type) fire once, and each of the slab's two species is recorded once,
// in the order the walk cut their cells across ticks, credited to the cutting player. The gate,
// cache and yield rows are the kernel's (`speedScaling.test.ts`).

const isCodex = (event: DomainEvent) => event.type.startsWith('codex.')

const materialKeysOf = (run: SlabRun) =>
  run.events.flatMap((event) =>
    event.type === 'codex.EntryAdded' && event.key.startsWith('material:') ? [event.key] : [],
  )

function brokenIndexOf(run: SlabRun, tile: TilePoint): number {
  return run.events.findIndex(
    (event) => event.type === 'TileDestroyed' && event.tx === tile.tx && event.ty === tile.ty,
  )
}

describe.each([84, 840])(
  'codex contacts in the speed-scaling slab at %i m/s (ticket 560)',
  (speed) => {
    let run: SlabRun
    beforeAll(() => {
      run = cutSpeedSlab(slabRigOf(strideOfSpeed(speed)))
    })

    it('records the ore type contacted and discovered once', () => {
      expect(run.events.filter((event) => event.type === 'codex.OreContacted')).toHaveLength(1)
      expect(run.events.filter((event) => event.type === 'codex.OreDiscovered')).toHaveLength(1)
    })

    it('records each species once, in the order its cell was cut', () => {
      const species = [SLAB_TILES.firstOre, SLAB_TILES.gated].map((tile) =>
        speciesIdAt(run.start, tile),
      )
      expect(species[0]).not.toBe(species[1])
      expect(materialKeysOf(run)).toEqual(species.map((id) => `material:${id}`))
    })

    it('records nothing before the first ore cell breaks, all of it for the cutting player', () => {
      const codex = run.events.filter(isCodex)
      const firstCodex = run.events.findIndex(isCodex)
      expect(firstCodex).toBeGreaterThan(brokenIndexOf(run, SLAB_TILES.firstOre))
      expect(new Set(codex.map((event) => event.playerId))).toEqual(new Set([CUTTING_PLAYER]))
    })
  },
)
