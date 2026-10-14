import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { freezeEnemies, spawnEnemy } from '../../../systems/authority/combat/combatFixtures'
import { createScriptedSession, FREEZE_ENEMIES } from '../../../systems/authority/scriptedSession'
import { contentOf } from '../../../systems/registries/content'
import { FACING, type Facing } from '../../../systems/vehicle/vehiclePose'
import { planetParamsFor } from '../../../systems/world/planetParams'
import { surfaceRowOfColumn, type TilePoint } from '../../../systems/world/tileGrid'
import { nodeCostOf } from '../../tech-tree'
import { standInPocket } from '../sensingTestSession'
import { divinerReadOf } from './divinerCone'
import { boardAfterHeard, EMPTY_REVEAL_BOARD } from './revealBoard'
import { scoutPingOf, scoutSlotOf, vagueMarksOf } from './scoutPing'
import {
  DIVINER_ROD,
  divinerLengthOf,
  SCOUT_PINGER,
  scoutRadiusOf,
  SENSING_FORK_BALANCE,
} from './sensingFork'
import { EMPTY_SENSING_VIEW, sensingViewAt } from './sensingView'

// The sensing lane's P16 fork (GD lock on #255, ticket 269): Scout pings wide and vague on its own
// clock, Diviner reads a narrow exact cone with every cut and warns of what waits in it.

const FORK_PLANET = 16
const SCOUT = 'tech.sensing.fork.scout'
const DIVINER = 'tech.sensing.fork.diviner'
const PARAMS = planetParamsFor(83921, FORK_PLANET)
/** Twenty tiles under the P16 surface, in solid ground. */
const POCKET: TilePoint = { tx: 20, ty: surfaceRowOfColumn(20, PARAMS.radiusTiles) - 20 }
const { scout, diviner } = SENSING_FORK_BALANCE

type Branch = 'scout' | 'diviner'

function chooseFork(branch: Branch): CommandIntent {
  return { type: 'tech-tree.choose_fork', payload: { lane: 'sensing', branch } } as CommandIntent
}

/** A rich miner on P16 at rest in a pocket, facing `facing`, with `branch` chosen (or none). */
function minerOnForkPlanet(branch: Branch | null, facing: Facing = FACING.down) {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: FORK_PLANET } })
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, { type: 'debug.setMoney', payload: { amount: '1e30' } })
  if (branch !== null) session.submit(0, chooseFork(branch))
  standInPocket(session, 1, POCKET, facing)
  return session
}

describe('sensing fork', () => {
  it('registers the Scout and the Diviner as the lane’s P16 pair, priced alike', () => {
    const nodes = contentOf('tech-node').filter((node) => node.id.startsWith('tech.sensing.fork.'))
    expect(nodes.map((node) => [node.id, node.unlockTier, node.unlocks])).toEqual([
      [DIVINER, FORK_PLANET, DIVINER_ROD],
      [SCOUT, FORK_PLANET, SCOUT_PINGER],
    ])
    for (const planet of [16, 30, 60]) {
      expect(nodeCostOf(SCOUT, planet)).toEqual(nodeCostOf(DIVINER, planet))
    }
  })

  it('plays only the chosen branch, at its Mark 1 magnitude', () => {
    const none = minerOnForkPlanet(null).state()
    expect([scoutRadiusOf(none, 'p1'), divinerLengthOf(none, 'p1')]).toEqual([null, null])
    const scouting = minerOnForkPlanet('scout').state()
    expect([scoutRadiusOf(scouting, 'p1'), divinerLengthOf(scouting, 'p1')]).toEqual([
      scout.radiusTiles,
      null,
    ])
    const divining = minerOnForkPlanet('diviner').state()
    expect([scoutRadiusOf(divining, 'p1'), divinerLengthOf(divining, 'p1')]).toEqual([
      null,
      diviner.lengthTiles,
    ])
  })

  it('pings once each time the Scout clock moves on a slot, whatever ticks a frame skips', () => {
    const state = minerOnForkPlanet('scout').state()
    const start = sensingViewAt(EMPTY_SENSING_VIEW, state, 'p1', scout.pingEveryTicks - 3)
    expect(start.board.marks).toEqual([])
    const pinged = sensingViewAt(start, state, 'p1', scout.pingEveryTicks + 7)
    expect(pinged.board.marks.length).toBeGreaterThan(0)
    expect(pinged.scoutSlot).toBe(scoutSlotOf(scout.pingEveryTicks))
    expect(sensingViewAt(pinged, state, 'p1', scout.pingEveryTicks + 8).board).toBe(pinged.board)
  })

  it('marks one vague cell per block, never a gate badge, kept until the dock', () => {
    const state = minerOnForkPlanet('scout').state()
    const ping = scoutPingOf(state, 'p1', 600)
    expect(ping?.untilTick).toBeNull()
    const marks = ping?.marks ?? []
    expect(marks.length).toBeGreaterThan(0)
    const half = Math.floor(scout.blockTiles / 2)
    const isBlockMiddle = (at: number) =>
      (((at - half) % scout.blockTiles) + scout.blockTiles) % scout.blockTiles === 0
    expect(marks.every((mark) => isBlockMiddle(mark.tile.tx) && isBlockMiddle(mark.tile.ty))).toBe(
      true,
    )
    expect(new Set(marks.map((mark) => `${mark.tile.tx},${mark.tile.ty}`)).size).toBe(marks.length)
    expect(marks.some((mark) => mark.kind === 'gate')).toBe(false)
    const docked = boardAfterHeard(
      {
        ...EMPTY_REVEAL_BOARD,
        marks: marks.map((mark) => ({ ...mark, bornTick: 600, untilTick: null })),
      },
      [{ type: 'DockEntered', tick: 700, playerId: 'p1', bay: 'sell' } as never],
      state,
      'p1',
    )
    expect(docked.marks).toEqual([])
  })

  it('shows the gravest thing in a block: lava over ore over open cave', () => {
    const marks = vagueMarksOf(
      [
        { tile: { tx: 0, ty: 0 }, kind: 'cave', gate: null },
        { tile: { tx: 1, ty: 0 }, kind: 'gate', gate: 'rig' },
        { tile: { tx: 2, ty: 1 }, kind: 'lava', gate: null },
        { tile: { tx: 5, ty: 0 }, kind: 'gate', gate: 'dynamite' },
      ],
      4,
    )
    expect(marks).toEqual([
      { tile: { tx: 2, ty: 2 }, kind: 'lava', gate: null },
      { tile: { tx: 6, ty: 2 }, kind: 'ore', gate: null },
    ])
  })

  it('reads a narrow cone ahead of the drill, only while the Diviner is chosen', () => {
    expect(divinerReadOf(minerOnForkPlanet('scout').state(), 'p1')).toBeNull()
    const read = divinerReadOf(minerOnForkPlanet('diviner', FACING.down).state(), 'p1')
    expect(read).not.toBeNull()
    const tiles = read?.tiles ?? []
    expect(tiles.length).toBeGreaterThan(0)
    expect(tiles.every((tile) => tile.ty < POCKET.ty)).toBe(true)
    expect(tiles.every((tile) => POCKET.ty - tile.ty <= diviner.lengthTiles)).toBe(true)
    const widest = Math.max(...tiles.map((tile) => Math.abs(tile.tx - POCKET.tx)))
    expect(widest).toBeLessThanOrEqual(Math.ceil(diviner.lengthTiles / 3))
  })

  it('warns of an enemy standing in the cone', () => {
    const session = minerOnForkPlanet('diviner', FACING.right)
    session.submit(2, freezeEnemies(true))
    session.submit(2, spawnEnemy('crawler', 1, 1))
    const warnings = divinerReadOf(session.state(), 'p1')?.warnings ?? []
    expect(warnings.map((warning) => warning.kind)).toContain('enemy')
  })

  it('marks the cone when the player’s own drill breaks a cell, and not for a blast', () => {
    const state = minerOnForkPlanet('diviner').state()
    const cut = { type: 'TileDestroyed', tick: 40, playerId: 'p1', kind: 'ground' } as never
    const blast = { ...(cut as object), cause: 'blast' } as never
    expect(boardAfterHeard(EMPTY_REVEAL_BOARD, [blast], state, 'p1').marks).toEqual([])
    const read = boardAfterHeard(EMPTY_REVEAL_BOARD, [cut], state, 'p1')
    expect(read.marks.length).toBeGreaterThan(0)
    expect(read.marks.every((mark) => mark.untilTick === 40 + diviner.revealTicks)).toBe(true)
  })
})
