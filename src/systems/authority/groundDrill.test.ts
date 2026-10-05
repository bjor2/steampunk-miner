import { describe, expect, it } from 'vitest'
import { oreSalePrice, oreTier } from '../economy/oreEconomy'
import { add, fromCanonical, ZERO_MONEY } from '../money'
import { FACING } from '../vehicle/vehiclePose'
import { cellDensitySum } from '../world/cellYield'
import { CELL_KIND, kindOfCell, tierOffsetOfCell } from '../world/worldCell'
import { EMPTY_WORLD, materialCellAt } from '../world/worldState'
import { UI_IDS } from '../views/screenIds'
import type { CommandIntent } from './authorityCommand'
import type { DomainEvent } from './domainEvent'
import { createScriptedSession, drill, PARAMS, poseAbove } from './scriptedSession'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'
import { stateDigest } from './stateDigest'
import type { TilePoint } from '../world/tileGrid'

/** 40 columns by 25 rows of band-1 ground and ore east of the dock: 1,000 cells. */
function scriptedRegion(): TilePoint[] {
  const tiles: TilePoint[] = []
  for (let ty = 291; ty > 266; ty--) {
    for (let tx = 20; tx < 60; tx++) tiles.push({ tx, ty })
  }
  return tiles
}

/** Mines each cell clear from above, refilling the tank as a dock would. */
function mineRegion(tiles: readonly TilePoint[]): DomainEvent[] {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId: 'cargo_hold', level: 400 } })
  let tick = 0
  for (const tile of tiles) {
    session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '150' } })
    session.submit(tick, poseAbove(tile, FACING.down))
    tick += 100
    session.submit(tick, drill(tile, 100))
  }
  return session.events()
}

function sumOfValues(events: readonly DomainEvent[]) {
  return events.reduce(
    (sum, event) => (event.type === 'CargoAdded' ? add(sum, fromCanonical(event.value)) : sum),
    ZERO_MONEY,
  )
}

describe('ore discovery (#42 acceptance 7)', () => {
  it('has no ore scanner or ping: no such command and no such HUD id', () => {
    const session = createScriptedSession()
    for (const type of ['scanOre', 'pingOre', 'oreScan', 'orePing']) {
      const [answer] = session.submit(1, { type, payload: {} } as unknown as CommandIntent)
      expect(answer).toMatchObject({ type: 'CommandRejected', reason: 'unknown_command' })
    }
    const ids = Object.values(UI_IDS).filter((id) => typeof id === 'string')
    expect(ids.filter((id) => /scan|ping/.test(id))).toEqual([])
  })
})

describe('ground drilling (#36 Yield)', () => {
  it('credits each ore cell of a 1,000-cell scripted run once, at the first-slice value', () => {
    const tiles = scriptedRegion()
    const ore = tiles.filter(
      (tile) => kindOfCell(materialCellAt(EMPTY_WORLD, PARAMS, tile)) === CELL_KIND.ore,
    )
    const firstSliceTotal = ore.reduce((sum, tile) => {
      const tierOffset = tierOffsetOfCell(materialCellAt(EMPTY_WORLD, PARAMS, tile))
      return add(sum, oreSalePrice(oreTier(1, 1 + tierOffset)))
    }, ZERO_MONEY)
    const events = mineRegion(tiles)
    const credited = events.filter((event) => event.type === 'CargoAdded')
    expect(tiles).toHaveLength(1000)
    expect(ore.length).toBeGreaterThan(50)
    expect(credited).toHaveLength(ore.length)
    expect(sumOfValues(events)).toEqual(firstSliceTotal)
  })

  it('restores a carved world from a snapshot to the same digest', () => {
    const session = createScriptedSession()
    session.submit(0, poseAbove({ tx: 20, ty: 290 }, FACING.down))
    session.submit(12, poseAbove({ tx: 20, ty: 290 }, FACING.down, { drillTicks: 12 }))
    session.submit(24, poseAbove({ tx: 20, ty: 290 }, FACING.right, { drillTicks: 12 }))
    const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
    expect('state' in restored && stateDigest(restored.state)).toBe(stateDigest(session.state()))
    expect(cellDensitySum(session.state().world, PARAMS, { tx: 20, ty: 290 })).toBeLessThan(4080)
  })
})
