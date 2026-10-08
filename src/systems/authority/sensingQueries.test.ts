import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../economy/economy'
import { fromCanonical } from '../money'
import { FACING } from '../vehicle/vehiclePose'
import { tilesWithin } from '../world/tileDisc'
import type { TilePoint } from '../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../world/worldCell'
import { cellAt } from '../world/worldState'
import { prepareCorridor, spawnEnemy } from './combat/combatFixtures'
import { createScriptedSession, PARAMS, surfaceOreTiles } from './scriptedSession'
import {
  densestOreClusterOf,
  densestOreClusterOn,
  lungeWarningsOf,
  oreDragGroundOf,
  type OreDragGround,
} from './sensingQueries'

// The authority's sensing reads for combos (GD lock on #206, TD ruling Q2, ticket 323).

const SHIFTER = { playerId: 'p1', tool: 'terrain-tools.ore_shifter' }
const ORIGIN: TilePoint = { tx: 0, ty: 0 }
const TWELVE_TILE_DISC_READS = 441

/** Ore at each `tx,ty` key, priced in whole money; every other tile is plain ground. */
function groundOf(saleValues: Readonly<Record<string, number>>) {
  const reads: string[] = []
  const ground: OreDragGround = {
    draggableOreAt: ({ tx, ty }) => {
      reads.push(`${tx},${ty}`)
      const value = saleValues[`${tx},${ty}`]
      return value === undefined ? null : { saleValue: fromCanonical(String(value)) }
    },
  }
  return { ground, reads }
}

/** Counts the reads `densestOreClusterOf` makes of a real planet's ground. */
function countingRealGround() {
  const reads: string[] = []
  const real = oreDragGroundOf(createScriptedSession().state(), SHIFTER) as OreDragGround
  const ground: OreDragGround = {
    draggableOreAt: (tile) => {
      reads.push(`${tile.tx},${tile.ty}`)
      return real.draggableOreAt(tile)
    },
  }
  return { ground, reads }
}

/** The corridor fight's state once the spawned crawler first winds up a lunge on p1. */
function crawlerWindingUp() {
  const session = createScriptedSession()
  const start = prepareCorridor(session, FACING.right)
  session.submit(start, spawnEnemy('crawler', 1, 3))
  for (let tick = start + 1; tick < start + 600; tick++) {
    session.advanceTo(tick)
    if (session.state().combat.enemies.some((enemy) => enemy.phase === 'windup')) break
  }
  return session.state()
}

describe('sensing queries', () => {
  it('warns of a crawler winding up a lunge inside the radius', () => {
    const state = crawlerWindingUp()
    const [crawler] = state.combat.enemies
    expect(crawler.phase).toBe('windup')
    expect(lungeWarningsOf(state, 'p1', 6)).toEqual([{ enemyId: crawler.id, kind: 'crawler' }])
  })

  it('stays quiet about a wind-up outside the radius or on another player', () => {
    const state = crawlerWindingUp()
    expect(lungeWarningsOf(state, 'p1', 0)).toEqual([])
    expect(lungeWarningsOf(state, 'p2', 6)).toEqual([])
  })

  it('stays quiet about an enemy that is only closing in', () => {
    const session = createScriptedSession()
    const start = prepareCorridor(session, FACING.right)
    session.submit(start, spawnEnemy('crawler', 1, 5))
    expect(session.state().combat.enemies[0].phase).not.toBe('windup')
    expect(lungeWarningsOf(session.state(), 'p1', 12)).toEqual([])
  })

  it('finds no cluster where no ore may be dragged', () => {
    expect(densestOreClusterOn(groundOf({}).ground, ORIGIN, 5)).toBeNull()
  })

  it('picks the ore cell whose 3x3 block holds the most draggable ore', () => {
    const { ground } = groundOf({ '-4,0': 9, '2,1': 1, '3,1': 1, '2,2': 1, '3,2': 1 })
    expect(densestOreClusterOn(ground, ORIGIN, 5)).toEqual({ tile: { tx: 2, ty: 1 }, score: 4 })
  })

  it('breaks a tie on the higher sale value, then on the lower row and column', () => {
    const richer = groundOf({ '1,1': 1, '-3,-3': 5 }).ground
    expect(densestOreClusterOn(richer, ORIGIN, 5)?.tile).toEqual({ tx: -3, ty: -3 })
    const level = groundOf({ '2,1': 3, '-2,1': 3, '0,-2': 3 }).ground
    expect(densestOreClusterOn(level, ORIGIN, 5)?.tile).toEqual({ tx: 0, ty: -2 })
    const sameRow = groundOf({ '2,1': 3, '-2,1': 3 }).ground
    expect(densestOreClusterOn(sameRow, ORIGIN, 5)?.tile).toEqual({ tx: -2, ty: 1 })
  })

  it('scores a block only by the ore inside the disc', () => {
    const edge = { '2,0': 1, '3,-1': 1, '3,0': 1, '3,1': 1 }
    const { ground, reads } = groundOf({ ...edge, '-1,0': 1, '-1,1': 1 })
    expect(densestOreClusterOn(ground, ORIGIN, 2)).toEqual({ tile: { tx: -1, ty: 0 }, score: 2 })
    expect(reads).not.toContain('3,0')
  })

  it('holds its radius to the echo sounder reach of twelve tiles', () => {
    expect(ECONOMY.itemHookCaps.reachCellsMax).toBe(12)
    expect(tilesWithin(ORIGIN, 12)).toHaveLength(TWELVE_TILE_DISC_READS)
  })

  it('reads each tile of a twelve-tile disc once: 441 reads, and no more for a wider ask', () => {
    for (const radius of [12, 30]) {
      const { ground, reads } = countingRealGround()
      densestOreClusterOn(ground, surfaceOreTiles(1)[0], radius)
      expect(reads).toHaveLength(TWELVE_TILE_DISC_READS)
      expect(new Set(reads).size).toBe(TWELVE_TILE_DISC_READS)
    }
  })

  it('lands on an ore cell of the real ground', () => {
    const state = createScriptedSession().state()
    const [ore] = surfaceOreTiles(1)
    const cluster = densestOreClusterOf(state, ore, 12, SHIFTER)
    expect(cluster).not.toBeNull()
    const tile = cluster?.tile as TilePoint
    expect(kindOfCell(cellAt(state.world, PARAMS, tile))).toBe(CELL_KIND.ore)
  })
})
