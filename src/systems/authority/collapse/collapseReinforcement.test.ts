import { describe, expect, it } from 'vitest'
import { COLLAPSE_FILL_TICKS, COLLAPSE_WARN_TICKS } from '../../../constants/balance'
import { withRegistrations } from '../../../registries/registrar'
import { blockContaining, blockIdOf, blockOfId, samplesOfBlock } from '../../world/collapseBlock'
import { SAMPLES_PER_TILE } from '../../world/sampleGrid'
import { isCarvedAirAt, openSampleLayers } from '../../world/sampleLayers'
import type { TilePoint } from '../../world/tileGrid'
import type { WorldState } from '../../world/worldState'
import { boreGunSlice, FIRE_EAST, lineEastOf, PLAIN_RIG, standInPocket } from '../bore/boreFixtures'
import { ofType } from '../charges/chargeFixtures'
import { createScriptedSession, PARAMS, type ScriptedSession } from '../scriptedSession'
import { braceCommand, braceProbeSlice } from './braceFixtures'
import { forceCollapseCommand } from './collapseCommands'
import { buildWeakTunnel } from './collapseFixtures'
import { reinforcementProbeSlice } from './reinforcementFixtures'
import { weakBlocksNearVehicles } from './collapseWatch'

// The weak band-2 tunnel warns its blocks at tick 10, so each would refill at 70.
const WARN_TICK = 10
const REFILL_TICK = WARN_TICK + COLLAPSE_WARN_TICKS
const DONE_TICK = REFILL_TICK + COLLAPSE_FILL_TICKS + 5

function weakTunnelSession(): ScriptedSession {
  const session = createScriptedSession()
  buildWeakTunnel(session, WARN_TICK)
  return session
}

/** The blocks the weak tunnel warns with nothing registered, in warning order. */
function tunnelBlocks(): string[] {
  return withRegistrations([], () =>
    ofType(weakTunnelSession().events(), 'CollapseWarned').map(({ block }) => block),
  )
}

const tileOfSample = (sample: number) => Math.floor(sample / SAMPLES_PER_TILE)

/** The carved-air samples of `block` lying in `tile`. */
function carvedAirOfTile(world: WorldState, block: string, tile: TilePoint) {
  const layers = openSampleLayers(world, PARAMS)
  const named = blockOfId(block)
  if (named === null) throw new Error(`not a block id: ${block}`)
  return samplesOfBlock(named).filter(
    ({ sx, sy }) =>
      isCarvedAirAt(layers, sx, sy) && tileOfSample(sx) === tile.tx && tileOfSample(sy) === tile.ty,
  )
}

/** The tile holding the block's first carved-air sample. */
function firstOpenTileOf(world: WorldState, block: string): TilePoint {
  const named = blockOfId(block)
  if (named === null) throw new Error(`not a block id: ${block}`)
  const layers = openSampleLayers(world, PARAMS)
  const open = samplesOfBlock(named).find(({ sx, sy }) => isCarvedAirAt(layers, sx, sy))
  if (open === undefined) throw new Error(`no carved air in ${block}`)
  return { tx: tileOfSample(open.sx), ty: tileOfSample(open.sy) }
}

const eventsOfBlock = (session: ScriptedSession, block: string) =>
  session.events().filter((event) => 'block' in event && event.block === block)

describe('collapse reinforcement: weakness and warnings (ticket 365)', () => {
  it('warns the weak tunnel with no provider registered', () => {
    expect(tunnelBlocks().length).toBeGreaterThan(0)
  })

  it('finds a block whose open cells are all reinforced not weak, and never warns it', () =>
    withRegistrations([reinforcementProbeSlice()], () => {
      const session = weakTunnelSession()
      session.advanceTo(DONE_TICK)
      expect(weakBlocksNearVehicles(session.state(), PARAMS)).toEqual([])
      expect(ofType(session.events(), 'CollapseWarned')).toEqual([])
      expect(ofType(session.events(), 'CollapseStarted')).toEqual([])
    }))

  it('still warns a block with an open cell left unreinforced, and refills round the cell', () => {
    const [block] = tunnelBlocks()
    const tile = withRegistrations([], () =>
      firstOpenTileOf(weakTunnelSession().state().world, block),
    )
    withRegistrations([reinforcementProbeSlice({ cells: [tile] })], () => {
      const session = weakTunnelSession()
      const before = carvedAirOfTile(session.state().world, block, tile)
      session.advanceTo(DONE_TICK)
      const types = eventsOfBlock(session, block).map(({ type }) => type)
      expect(types).toEqual(['CollapseWarned', 'CollapseStarted'])
      expect(before.length).toBeGreaterThan(0)
      expect(carvedAirOfTile(session.state().world, block, tile)).toEqual(before)
    })
  })

  it('cancels a warning at its refill tick once its block is reinforced, and fills nothing', () => {
    const [block] = tunnelBlocks()
    withRegistrations([reinforcementProbeSlice({ fromTick: WARN_TICK + 10 })], () => {
      const session = weakTunnelSession()
      session.advanceTo(DONE_TICK)
      expect(eventsOfBlock(session, block).map(({ type, tick }) => [type, tick])).toEqual([
        ['CollapseWarned', WARN_TICK],
        ['CollapseCancelled', REFILL_TICK],
      ])
      expect(ofType(session.events(), 'CollapseStarted')).toEqual([])
    })
  })

  it('never warns or braces a block that is reinforced and braced', () => {
    const blocks = tunnelBlocks()
    withRegistrations([braceProbeSlice(), reinforcementProbeSlice()], () => {
      const session = createScriptedSession()
      session.submit(5, braceCommand(blocks))
      buildWeakTunnel(session, WARN_TICK)
      session.advanceTo(DONE_TICK)
      expect(ofType(session.events(), 'CollapseWarned')).toEqual([])
      expect(ofType(session.events(), 'CollapseBraced')).toEqual([])
    })
  })
})

describe('collapse reinforcement: forced warnings (ticket 365)', () => {
  it('starts no warning when a reinforced block is forced through the debug command', () => {
    const [block] = tunnelBlocks()
    withRegistrations([reinforcementProbeSlice()], () => {
      const session = weakTunnelSession()
      session.submit(WARN_TICK + 1, forceCollapseCommand(block))
      session.advanceTo(DONE_TICK)
      expect(ofType(session.events(), 'CollapseWarned')).toEqual([])
      expect(session.state().collapse.blocks).toEqual([])
    })
  })

  it("starts none of a bore's forced warnings in reinforced blocks", () => {
    const fire = () => {
      const session = createScriptedSession()
      standInPocket(session, PLAIN_RIG, 0)
      session.submit(WARN_TICK, FIRE_EAST)
      session.advanceTo(200)
      return ofType(session.events(), 'CollapseWarned')
    }
    const bored = lineEastOf(PLAIN_RIG).map((tile) =>
      blockIdOf(blockContaining({ xMm: tile.tx * 1000 + 500, yMm: tile.ty * 1000 + 500 })),
    )
    const unreinforced = withRegistrations([boreGunSlice()], fire)
    expect(unreinforced.map(({ block }) => block).every((block) => bored.includes(block))).toBe(
      true,
    )
    expect(unreinforced.length).toBeGreaterThan(0)
    expect(withRegistrations([boreGunSlice(), reinforcementProbeSlice()], fire)).toEqual([])
  })
})
