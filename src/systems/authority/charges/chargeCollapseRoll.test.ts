import { describe, expect, it } from 'vitest'
import { COLLAPSE_FILL_TICKS, COLLAPSE_WARN_TICKS } from '../../../constants/balance'
import { projectDomainEvent } from '../../../logging/domainEventProjection'
import { chargeRadiusMm } from '../../economy/chargeSizes'
import { fromCanonical } from '../../money'
import { blockOfId, samplesOfBlock, type CollapseBlock } from '../../world/collapseBlock'
import { cellDensitySum } from '../../world/cellYield'
import { freshPlanetParamsFor, type PlanetParams } from '../../world/planetParams'
import { SAMPLES_PER_TILE } from '../../world/sampleGrid'
import type { TilePoint } from '../../world/tileGrid'
import { isTileYielded, materialCellAt, type WorldState } from '../../world/worldState'
import { createAuthorityState } from '../authorityState'
import { diggerIntents, poseAt } from '../collapse/collapseFixtures'
import type { DomainEvent } from '../domainEvent'
import { statsOfVehicle } from '../../vehicle/vehicleState'
import type { CommandIntent } from '../authorityCommand'
import { ticksPerCell } from '../groundDrill'
import {
  continueScriptedSession,
  FREEZE_ENEMIES,
  PARAMS,
  WORLD_SEED,
  type ScriptedSession,
} from '../scriptedSession'
import { readSnapshot, takeSnapshot } from '../sessionSnapshot'
import { stateDigest } from '../stateDigest'
import { collapseRollOf } from './blastCollapseRoll'
import { ofType, poseOnTile, solidBlastSiteOn } from './chargeFixtures'
import { startLiveBlast } from './liveBlast'
import { BLAST_TICK, blastAt, liveBlastSession, SOLID_SITE } from './liveBlastFixtures'

/** Size 8 is the first size whose bare crater collapses at its full 5000 bp (D6 #865). */
const HALF_CHANCE_SIZE = 8
/** Size 4 is the largest that never collapses. */
const STEADY_SIZE = 4
/** Past a size-8 blast's slices and rim checks, every warning and every refill. */
const SETTLED_TICK = BLAST_TICK + 40 + COLLAPSE_WARN_TICKS + COLLAPSE_FILL_TICKS
/** A planet whose solid rock the starting drill cannot scratch. */
const WEAK_RIG_PLANET = 40
/** Where the specs' digger waits, well away from the crater. */
const FAR_TILE: TilePoint = { tx: SOLID_SITE.tx - 40, ty: SOLID_SITE.ty }

function sizedBlastAt(site: TilePoint, size: number, blastSeq = 0) {
  return { ...blastAt(site, chargeRadiusMm(size), { size }), blastSeq }
}

/** A digger that cuts the site's rock waits at `stand` while a blast of `size` goes live. */
function bareBlastSession(size: number, stand: TilePoint = FAR_TILE): ScriptedSession {
  return liveBlastSession([sizedBlastAt(SOLID_SITE, size)], ['p1'], (session) => {
    diggerIntents().forEach((intent) => session.submit(0, intent))
    session.submit(0, poseOnTile(stand))
  })
}

/** The blocks a blast's rolls collapsed, in the order they warned. */
function collapsedBlocksOf(events: readonly DomainEvent[]): string[] {
  return ofType(events, 'BlastCollapseRolled')
    .filter(({ isCollapsing }) => isCollapsing)
    .map(({ block }) => block)
}

function tilesOfBlock(block: CollapseBlock): TilePoint[] {
  const tiles = new Map<string, TilePoint>()
  for (const { sx, sy } of samplesOfBlock(block)) {
    const tile = { tx: Math.floor(sx / SAMPLES_PER_TILE), ty: Math.floor(sy / SAMPLES_PER_TILE) }
    tiles.set(`${tile.tx},${tile.ty}`, tile)
  }
  return [...tiles.values()]
}

function centreTileOf(block: CollapseBlock): TilePoint {
  const [first] = samplesOfBlock(block)
  const half = 8
  return {
    tx: Math.floor((first.sx + half) / SAMPLES_PER_TILE),
    ty: Math.floor((first.sy + half) / SAMPLES_PER_TILE),
  }
}

/**
 * A body centre 950 mm into the cell along both axes: its clearance circle leaves the cell's far
 * corner, so only the rig-cell rule keeps the whole cell open.
 */
function nearCornerOf(tile: TilePoint): [number, number] {
  const inset = 950
  return [tile.tx * 1000 + inset, tile.ty * 1000 + inset]
}

function densityOf(world: WorldState, tile: TilePoint, params: PlanetParams = PARAMS): number {
  return cellDensitySum(world, params, tile)
}

/** A size-8 blast on planet `planetIndex` with the digger far off, run for `ticks` ticks. */
function replayedCollapse(planetIndex: number, ticks: number) {
  return blastOnPlanet(planetIndex, diggerIntents(), ticks)
}

/**
 * A size-8 blast in solid rock of planet `planetIndex`, the vehicle 40 tiles west of it after
 * `intents`, run for `ticks` ticks.
 */
function blastOnPlanet(planetIndex: number, intents: readonly CommandIntent[], ticks: number) {
  const start = createAuthorityState({ planetIndex, planetSeed: WORLD_SEED, playerIds: ['p1'] })
  const session = continueScriptedSession(start)
  const site = solidBlastSiteOn(planetIndex)
  session.submit(0, FREEZE_ENEMIES)
  intents.forEach((intent) => session.submit(0, intent))
  session.submit(0, poseOnTile({ tx: site.wall.tx - 40, ty: site.wall.ty }))
  const blasted = continueScriptedSession(
    startLiveBlast(session.state(), sizedBlastAt(site.wall, HALF_CHANCE_SIZE)),
  )
  blasted.advanceTo(BLAST_TICK + ticks)
  return {
    digest: stateDigest(blasted.state()),
    events: blasted.events(),
    state: blasted.state(),
    site,
  }
}

describe('bare blast collapse roll (ticket 861)', () => {
  it("rolls each bare rim block once with hash(worldSeed, s, p, block, blastSeq) against the size's 5000 bp", () => {
    const session = bareBlastSession(HALF_CHANCE_SIZE)
    session.advanceTo(SETTLED_TICK)
    const rolls = ofType(session.events(), 'BlastCollapseRolled')
    expect(new Set(rolls.map(({ block }) => block)).size).toBe(rolls.length)
    for (const rolled of rolls) {
      const roll = collapseRollOf(PARAMS, blockOfId(rolled.block) as CollapseBlock, 0)
      expect(rolled).toMatchObject({ blastSeq: 0, collapseBp: 5000, roll })
      expect(rolled.isCollapsing).toBe(roll < 5000)
    }
    const collapsed = collapsedBlocksOf(session.events())
    expect(collapsed.length).toBeGreaterThan(0)
    expect(collapsed.length).toBeLessThan(rolls.length)
  })

  it('rolls nothing and collapses nothing for sizes 1 to 4', () => {
    for (let size = 1; size <= STEADY_SIZE; size++) {
      const session = bareBlastSession(size)
      session.advanceTo(SETTLED_TICK)
      expect(ofType(session.events(), 'BlastCollapseRolled')).toEqual([])
      expect(ofType(session.events(), 'CollapseWarned')).toEqual([])
    }
  })

  it('logs every roll as one blast_collapse_roll line', () => {
    const session = bareBlastSession(HALF_CHANCE_SIZE)
    session.advanceTo(SETTLED_TICK)
    const [rolled] = ofType(session.events(), 'BlastCollapseRolled')
    expect(projectDomainEvent(rolled)?.line).toMatchObject({
      event: 'blast_collapse_roll',
      data: {
        blastSeq: 0,
        block: rolled.block,
        collapseBp: 5000,
        roll: rolled.roll,
        isCollapsing: rolled.isCollapsing,
      },
    })
  })

  it('warns every collapsing block for a full second before its refill, counted as the blast triggering it', () => {
    const session = bareBlastSession(HALF_CHANCE_SIZE)
    session.advanceTo(SETTLED_TICK)
    const collapsed = collapsedBlocksOf(session.events())
    const warned = ofType(session.events(), 'CollapseWarned')
    const started = ofType(session.events(), 'CollapseStarted')
    for (const block of collapsed) {
      const warning = warned.find((event) => event.block === block) as DomainEvent
      const refill = started.find((event) => event.block === block) as DomainEvent
      expect(refill.tick - warning.tick).toBe(COLLAPSE_WARN_TICKS)
    }
    const [resolved] = ofType(session.events(), 'BlastResolved')
    expect(resolved.collapsesTriggered).toBe(collapsed.length)
    expect(session.state().collapse.blocks).toEqual([])
  })

  it('refills the collapsed cells with their own material, still yielded, so their ore and hardness are as they were and nothing pays twice', () => {
    const session = bareBlastSession(HALF_CHANCE_SIZE)
    const before = session.state().world
    session.advanceTo(SETTLED_TICK)
    const after = session.state().world
    const collapsed = collapsedBlocksOf(session.events()).map(
      (id) => blockOfId(id) as CollapseBlock,
    )
    const refilled = collapsed.flatMap(tilesOfBlock).filter((tile) => densityOf(after, tile) > 0)
    expect(refilled.length).toBeGreaterThan(0)
    for (const tile of refilled) {
      expect(materialCellAt(after, PARAMS, tile)).toBe(materialCellAt(before, PARAMS, tile))
    }
    const blasted = refilled.filter((tile) => isTileYielded(after, tile))
    expect(blasted.length).toBeGreaterThan(0)
  })

  it('never crushes the rig, never takes its money and never refills its cell when it stands in a collapsing block', () => {
    const probe = bareBlastSession(HALF_CHANCE_SIZE)
    probe.advanceTo(SETTLED_TICK)
    const [firstCollapse] = collapsedBlocksOf(probe.events())
    const rigCell = centreTileOf(blockOfId(firstCollapse) as CollapseBlock)
    const session = bareBlastSession(HALF_CHANCE_SIZE)
    const warning = ofType(probe.events(), 'CollapseWarned').find(
      ({ block }) => block === firstCollapse,
    ) as DomainEvent
    session.advanceTo(warning.tick)
    session.submit(warning.tick + 1, { type: 'debug.setMoney', payload: { amount: '5000' } })
    session.submit(warning.tick + 1, poseAt(...nearCornerOf(rigCell)))
    expect(session.state().players.p1.vehicle.pose).toMatchObject({
      x: nearCornerOf(rigCell)[0],
      y: nearCornerOf(rigCell)[1],
    })
    const { hull } = session.state().players.p1.vehicle
    const { wallet } = session.state().players.p1
    expect(wallet).toEqual(fromCanonical('5000'))
    session.advanceTo(SETTLED_TICK)
    const started = ofType(session.events(), 'CollapseStarted').find(
      ({ block }) => block === firstCollapse,
    )
    expect(started?.vehiclesHit).toBe(0)
    expect(ofType(session.events(), 'VehicleDamaged')).toEqual([])
    expect(session.state().players.p1.vehicle.hull).toEqual(hull)
    expect(session.state().players.p1.wallet).toEqual(wallet)
    expect(densityOf(session.state().world, rigCell)).toBe(0)
  })

  it('leaves open every cell a vehicle on the planet could not drill, so it never seals a weaker rig in', () => {
    const params = freshPlanetParamsFor(WORLD_SEED, WEAK_RIG_PLANET)
    const { events, state, site } = blastOnPlanet(WEAK_RIG_PLANET, [], SETTLED_TICK)
    const material = materialCellAt(state.world, params, site.wall)
    const drill = statsOfVehicle(state.players.p1.vehicle)
    expect(ticksPerCell(drill, params, site.wall, material)).toBeNull()
    const collapsed = collapsedBlocksOf(events)
    expect(collapsed.length).toBeGreaterThan(0)
    const started = ofType(events, 'CollapseStarted').filter(({ block }) =>
      collapsed.includes(block),
    )
    expect(started).toHaveLength(collapsed.length)
    expect(started.map(({ samplesFilled }) => samplesFilled)).toEqual(started.map(() => 0))
  })

  it('carries a collapse through a reload mid-warning without rerolling it', () => {
    const whole = bareBlastSession(HALF_CHANCE_SIZE)
    whole.advanceTo(SETTLED_TICK)
    const [firstWarning] = ofType(whole.events(), 'CollapseWarned')
    const cut = bareBlastSession(HALF_CHANCE_SIZE)
    cut.advanceTo(firstWarning.tick + 10)
    const snapshot = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(cut.state()))))
    if (!('state' in snapshot)) throw new Error('snapshot did not read back')
    expect(snapshot.state.collapse.blocks.some((entry) => entry.isBlast === true)).toBe(true)
    const reloaded = continueScriptedSession(snapshot.state)
    reloaded.advanceTo(SETTLED_TICK)
    const afterCut = whole.events().filter(({ tick }) => tick > firstWarning.tick + 10)
    expect(JSON.stringify(reloaded.events())).toBe(JSON.stringify(afterCut))
    expect(stateDigest(reloaded.state())).toBe(stateDigest(whole.state()))
  })

  it('refuses a saved collapse entry whose blast bit is written false', () => {
    const cut = bareBlastSession(HALF_CHANCE_SIZE)
    cut.advanceTo(SETTLED_TICK - COLLAPSE_FILL_TICKS - 20)
    const snapshot = JSON.parse(JSON.stringify(takeSnapshot(cut.state())))
    const blocks = snapshot.state.collapse.blocks
    const at = blocks.findIndex((entry: { isBlast?: true }) => entry.isBlast === true)
    expect(at).toBeGreaterThanOrEqual(0)
    blocks[at] = { ...blocks[at], isBlast: false }
    expect(readSnapshot(snapshot).problems).toEqual([
      `snapshot.state.collapse.blocks[${at}] is malformed`,
    ])
  })

  it('replays a collapsing blast byte for byte at g = 1, 5, 40 and 1e6', () => {
    for (const planetIndex of [1, 5, 40, 1_000_000]) {
      const first = replayedCollapse(planetIndex, SETTLED_TICK)
      const second = replayedCollapse(planetIndex, SETTLED_TICK)
      expect(collapsedBlocksOf(first.events).length).toBeGreaterThan(0)
      expect(JSON.stringify(second.events)).toBe(JSON.stringify(first.events))
      expect(second.digest).toBe(first.digest)
    }
  })

  it('rolls afresh for the next blast at the same place', () => {
    const first = liveBlastSession([sizedBlastAt(SOLID_SITE, HALF_CHANCE_SIZE, 0)])
    const second = liveBlastSession([sizedBlastAt(SOLID_SITE, HALF_CHANCE_SIZE, 1)])
    first.advanceTo(SETTLED_TICK)
    second.advanceTo(SETTLED_TICK)
    expect(collapsedBlocksOf(second.events())).not.toEqual(collapsedBlocksOf(first.events()))
  })
})

describe('bare blast collapse roll: planets past 1 (ticket 861)', () => {
  it('rolls on the planet the session stands on', () => {
    const params = freshPlanetParamsFor(WORLD_SEED, 5)
    const { events } = replayedCollapse(5, SETTLED_TICK)
    const [rolled] = ofType(events, 'BlastCollapseRolled')
    expect(rolled.roll).toBe(collapseRollOf(params, blockOfId(rolled.block) as CollapseBlock, 0))
  })
})
