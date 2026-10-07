import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { FACING } from '../../vehicle/vehiclePose'
import { cellDensitySum } from '../../world/cellYield'
import { surfaceRowOfColumn, type TilePoint } from '../../world/tileGrid'
import { AIR_CELL } from '../../world/worldCell'
import { cellAt } from '../../world/worldState'
import type { CommandRule } from '../commandRule'
import { blastAt, liveBlastSession, R24_MM, SOLID_SITE } from '../charges/liveBlastFixtures'
import { ofType } from '../charges/chargeFixtures'
import { drill, PARAMS, poseAbove, type ScriptedSession } from '../scriptedSession'
import { stateDigest } from '../stateDigest'
import { queueTerrainEdit, type TerrainCellEdit } from './terrainEdits'

// A power-up queues its terrain edit from a slice command (#162); a fake slice registers one through
// withRegistrations, so no real slice is imported. The pocket opens every tile whose centre lies
// within 2 tiles of a point, at most 32 density cells (#162 section 3).
declare module '../authorityCommand' {
  interface CommandPayloads {
    'probe.openPocket': { tx: number; ty: number }
  }
}

const POCKET_REACH = 2

/** The tiles round the corner where chunks 5,3 / 4,3 / 5,4 / 4,4 meet (tile 160, 128). */
const CORNER: TilePoint = { tx: 160, ty: 128 }

function pocketCellsAround(corner: TilePoint): TerrainCellEdit[] {
  const cells: TerrainCellEdit[] = []
  for (let dy = -POCKET_REACH; dy < POCKET_REACH; dy++) {
    for (let dx = -POCKET_REACH; dx < POCKET_REACH; dx++) {
      cells.push({ kind: 'density', tx: corner.tx + dx, ty: corner.ty + dy, density: 0 })
    }
  }
  return cells
}

const OPEN_POCKET: CommandRule<'probe.openPocket'> = {
  fields: { tx: 'safeInteger', ty: 'safeInteger' },
  apply: (state, { playerId, payload }) => ({
    state: queueTerrainEdit(state, {
      playerId,
      source: 'probe.pocket',
      cells: pocketCellsAround(payload),
    }),
    events: [],
  }),
}

const POCKET_SLICE: SliceDefinition = {
  id: 'probe',
  register: (r) => r.commandRules({ 'probe.openPocket': OPEN_POCKET }),
}

const openPocketAt = (tile: TilePoint) => ({ type: 'probe.openPocket' as const, payload: tile })

/** Ticks on which each chunk's ground changed. */
function changedChunksByTick(session: ScriptedSession, fromTick: number) {
  const byTick = new Map<number, string[]>()
  for (const { tick, cx, cy } of ofType(session.events(), 'GroundChanged')) {
    if (tick < fromTick) continue
    byTick.set(tick, [...(byTick.get(tick) ?? []), `${cx},${cy}`])
  }
  return byTick
}

function isPocketOpen(session: ScriptedSession): boolean {
  return pocketCellsAround(CORNER).every(
    (cell) => cellDensitySum(session.state().world, PARAMS, cell) === 0,
  )
}

/** Players p1..p4 above ground tiles of their own, far from the blast and the pocket. */
const PLAYERS = ['p1', 'p2', 'p3', 'p4']
const DIG_TILES: TilePoint[] = PLAYERS.map((_, at) => {
  const tx = 20 + 4 * at
  return { tx, ty: surfaceRowOfColumn(tx, PARAMS.radiusTiles) }
})
/** Half the digging before the blast goes live, the other half (and the break) during it. */
const DIG_START_TICK = 20
const BLAST_TICK = DIG_START_TICK + 1
const BREAK_TICK = BLAST_TICK + 19

/** R24 live from `BLAST_TICK`, 4 players drilling, a pocket queued on the blast's first tick. */
function blastWithDiggersAndPocket() {
  return withRegistrations([POCKET_SLICE], () => {
    const session = liveBlastSession(
      [blastAt(SOLID_SITE, R24_MM, { tick: BLAST_TICK, size: 10 })],
      PLAYERS,
      (prepared) => {
        PLAYERS.forEach((playerId, at) =>
          prepared.submit(0, poseAbove(DIG_TILES[at], FACING.down), playerId),
        )
        PLAYERS.forEach((playerId, at) =>
          prepared.submit(DIG_START_TICK, drill(DIG_TILES[at], DIG_START_TICK), playerId),
        )
      },
    )
    session.advanceTo(BLAST_TICK)
    session.submit(BLAST_TICK, openPocketAt(CORNER))
    session.advanceTo(BREAK_TICK)
    PLAYERS.forEach((playerId, at) =>
      session.submit(BREAK_TICK, drill(DIG_TILES[at], 20), playerId),
    )
    session.advanceTo(BLAST_TICK + 60)
    return session
  })
}

describe('terrain edit queue', () => {
  it('finishes a pocket at a 4-chunk corner in 2 ticks, the 2 lowest chunk ids first', () => {
    const session = withRegistrations([POCKET_SLICE], () => {
      const pocket = liveBlastSession([])
      pocket.submit(1, openPocketAt(CORNER))
      pocket.advanceTo(10)
      return pocket
    })
    expect([...changedChunksByTick(session, 2).entries()]).toEqual([
      [2, ['4,3', '4,4']],
      [3, ['5,3', '5,4']],
    ])
    expect(isPocketOpen(session)).toBe(true)
    expect(session.state().terrainEdits).toEqual([])
  })

  it('gives the corner pocket the same digest on every replay', () => {
    const replay = () =>
      withRegistrations([POCKET_SLICE], () => {
        const pocket = liveBlastSession([])
        pocket.submit(1, openPocketAt(CORNER))
        pocket.advanceTo(10)
        return stateDigest(pocket.state())
      })
    expect(replay()).toBe(replay())
  })

  it('clears R24 in 29 ticks with 4 players drilling and a pocket landing on its first tick', () => {
    const session = blastWithDiggersAndPocket()
    const sliceTicks = ofType(session.events(), 'BlastFront').map(({ tick }) => tick)
    expect(sliceTicks).toEqual(Array.from({ length: 29 }, (_, k) => BLAST_TICK + k))
    const drilled = ofType(session.events(), 'TileDestroyed').filter(
      ({ cause }) => cause !== 'blast',
    )
    const world = session.state().world
    expect(DIG_TILES.filter((tile) => cellAt(world, PARAMS, tile) !== AIR_CELL)).toEqual([])
    expect(drilled.map(({ tick }) => tick)).toEqual(drilled.map(() => BREAK_TICK))
    expect(drilled.length).toBeGreaterThan(0)
  })

  it('finishes the deferred pocket within 10 ticks of the blast going live', () => {
    const session = blastWithDiggersAndPocket()
    const pocketTicks = [...changedChunksByTick(session, BLAST_TICK).entries()]
      .filter(([, chunks]) => chunks.includes('5,4') || chunks.includes('4,4'))
      .map(([tick]) => tick)
    expect(Math.max(...pocketTicks)).toBeLessThanOrEqual(BLAST_TICK + 10)
    expect(isPocketOpen(session)).toBe(true)
  })

  it('gives the same digest when the blast, the drilling and the pocket replay', () => {
    expect(stateDigest(blastWithDiggersAndPocket().state())).toBe(
      stateDigest(blastWithDiggersAndPocket().state()),
    )
  })
})
