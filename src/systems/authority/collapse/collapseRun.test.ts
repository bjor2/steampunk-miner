import { describe, expect, it } from 'vitest'
import { COLLAPSE_FILL_TICKS, COLLAPSE_WARN_TICKS } from '../../../constants/balance'
import { drillStampOf } from '../../vehicle/drillStamp'
import { FACING } from '../../vehicle/vehiclePose'
import {
  blockContaining,
  blockIdOf,
  blockOfId,
  firstSampleOfBlock,
  type CollapseBlock,
} from '../../world/collapseBlock'
import { chunkOfSample, localSampleOf, MM_PER_SAMPLE, sampleIndexOf } from '../../world/sampleGrid'
import { dockSiteOf } from '../../world/dockSite'
import { planetParamsFor, type PlanetParams } from '../../world/planetParams'
import { currentDensityOfChunk, generatedChunkOf } from '../../world/worldState'
import type { DomainEvent } from '../domainEvent'
import { advanceTicks } from '../advanceTicks'
import type { AuthorityCommand } from '../authorityCommand'
import { createAuthorityState } from '../authorityState'
import { createLoopbackAuthority } from '../loopbackAuthority'
import { readSnapshot, takeSnapshot } from '../sessionSnapshot'
import { stateDigest } from '../stateDigest'
import {
  createScriptedSession,
  FREEZE_ENEMIES,
  PARAMS,
  WORLD_SEED,
  type ScriptedSession,
} from '../scriptedSession'
import {
  BAND_1_Y,
  BAND_2_Y,
  buildWeakTunnel,
  digAlong,
  lineTunnel,
  parkAt,
  poseAt,
  prepareDigger,
  TUNNEL_FROM_X,
  TUNNEL_TO_X,
  weakTunnelIntents,
} from './collapseFixtures'
import { forceCollapseCommand } from './collapseDebugRules'

const ofType = <T extends DomainEvent['type']>(events: readonly DomainEvent[], type: T) =>
  events.filter((event): event is Extract<DomainEvent, { type: T }> => event.type === type)

const TUNNEL_MIDDLE_X = (TUNNEL_FROM_X + TUNNEL_TO_X) / 2

/** The block a body centre sits in. */
const blockOfBody = (x: number, y: number) => blockIdOf(blockContaining({ xMm: x, yMm: y }))

function densityAt(session: ScriptedSession, sx: number, sy: number): number {
  const world = session.state().world
  const density = currentDensityOfChunk(world, PARAMS, chunkOfSample(sx), chunkOfSample(sy))
  return density[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))]
}

/** The x range of a block in mm, `[from, to)`. */
function xSpanOf(block: CollapseBlock): { from: number; to: number } {
  const { sx } = firstSampleOfBlock(block)
  return { from: sx * MM_PER_SAMPLE, to: (sx + 16) * MM_PER_SAMPLE }
}

describe('collapse: a straight dig (#43 acceptance 8, 3)', () => {
  it('never warns while digging 20 m in band 1 at grade 1, stopping at the face and at a dead end', () => {
    const session = createScriptedSession()
    prepareDigger(session, 0)
    const dug = digAlong(session, 0, BAND_1_Y, 20500, 40500)
    const parked = parkAt(session, dug, dug + 600, 40500, BAND_1_Y)
    const back = digAlong(session, parked, BAND_1_Y, 40500, 18300, 0)
    parkAt(session, back, back + 600, 18300, BAND_1_Y)
    expect(ofType(session.events(), 'CasingPlaced').length).toBeGreaterThan(30)
    expect(ofType(session.events(), 'CollapseWarned')).toEqual([])
  })

  it('warns on the lined blocks behind a band-2 dig at grade 1 and never on the face', () => {
    const session = createScriptedSession()
    prepareDigger(session, 0)
    // Stops with the body 0.5 m into a block, so the face's block holds only unlined wall.
    const end = -11500
    const dug = digAlong(session, 0, BAND_2_Y, -31500, end)
    parkAt(session, dug, dug + 600, end, BAND_2_Y)
    const face = drillStampOf(session.vehicle().pose!, false)
    const faceBlock = blockContaining(face)
    const warned = ofType(session.events(), 'CollapseWarned')
    expect(warned.length).toBeGreaterThan(4)
    expect(warned.every(({ band, required }) => band === 2 && required === 2)).toBe(true)
    expect(warned.every(({ weakestGrade }) => weakestGrade === 1)).toBe(true)
    expect(warned.map(({ block }) => block)).not.toContain(blockIdOf(faceBlock))
    const faceFrom = xSpanOf(faceBlock).from
    expect(warned.every(({ block }) => xSpanOf(blockOfId(block)!).to <= faceFrom)).toBe(true)
  })

  it('refills each warned block exactly 60 ticks after its warning, unless cancelled', () => {
    const session = createScriptedSession()
    prepareDigger(session, 0)
    const dug = digAlong(session, 0, BAND_2_Y, -31500, -11500)
    parkAt(session, dug, dug + 600, -11500, BAND_2_Y)
    const events = session.events()
    const started = ofType(events, 'CollapseStarted')
    expect(started.length).toBeGreaterThan(4)
    for (const warning of ofType(events, 'CollapseWarned')) {
      const ended = events.find(
        (event) =>
          (event.type === 'CollapseStarted' || event.type === 'CollapseCancelled') &&
          event.block === warning.block &&
          event.tick >= warning.tick,
      )
      expect(ended).toBeDefined()
      if (ended?.type === 'CollapseStarted') expect(ended.tick - warning.tick).toBe(60)
    }
  })

  it('never collapses a band-2 shaft lined at grade 2, over ten minutes beside it', () => {
    const session = createScriptedSession()
    prepareDigger(session, 0, 2)
    const dug = digAlong(session, 0, BAND_2_Y, -31500, -11500)
    const back = digAlong(session, dug, BAND_2_Y, -11500, -21500, 0)
    parkAt(session, back, back + 36000, -21500, BAND_2_Y, 120)
    expect(ofType(session.events(), 'CasingPlaced').length).toBeGreaterThan(30)
    expect(ofType(session.events(), 'CollapseWarned')).toEqual([])
  })
})

describe('collapse: generated caves (#43 acceptance 1)', () => {
  /** Up to `count` generated-air points within 200 m of the dock, spread over the first 150 m down. */
  function cavePointsNearDock(seed: number, count: number): { x: number; y: number }[] {
    const params = planetParamsFor(seed, 1)
    const dock = dockSiteOf(params).dockPoint
    const points: { x: number; y: number }[] = []
    for (let ty = dock.ty - 4; ty > dock.ty - 150 && points.length < count; ty -= 3) {
      for (let tx = -150; tx <= 150 && points.length < count; tx += 7) {
        const isNear = (tx - dock.tx) ** 2 + (ty - dock.ty) ** 2 <= 200 * 200
        if (isNear && isGeneratedAir(params, 4 * tx + 2, 4 * ty + 2)) {
          points.push({ x: tx * 1000 + 500, y: ty * 1000 + 500 })
          tx += 40
        }
      }
    }
    return points
  }

  function isGeneratedAir(params: PlanetParams, sx: number, sy: number): boolean {
    const { density } = generatedChunkOf(params, chunkOfSample(sx), chunkOfSample(sy))
    return density[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))] <= 128
  }

  it('never warns beside a generated cave, even lined at grade 1, on ten seeds', () => {
    const seeds = Array.from({ length: 10 }, (_, at) => 1000 + 7919 * at)
    let visited = 0
    for (const seed of seeds) {
      const session = createScriptedSession()
      session.submit(1, { type: 'debug.setPlanetSeed', payload: { planetSeed: seed } })
      session.submit(1, FREEZE_ENEMIES)
      cavePointsNearDock(seed, 6).forEach((point, at) => {
        session.submit(10 + at * 120, poseAt(point.x, point.y))
        session.submit(10 + at * 120, {
          type: 'debug.lineCasing',
          payload: { x: point.x, y: point.y, grade: 1 },
        })
        visited++
      })
      session.advanceTo(1000)
      expect(ofType(session.events(), 'CollapseWarned')).toEqual([])
    }
    expect(visited).toBeGreaterThan(20)
  })
})

describe('collapse: warning and cancelling (#43 sequence 1, build note 2, acceptance 7)', () => {
  it('warns every weak block within 16 m of the vehicle and refills it a second later', () => {
    const session = createScriptedSession()
    buildWeakTunnel(session, 10)
    const warned = ofType(session.events(), 'CollapseWarned')
    expect(warned.length).toBeGreaterThan(4)
    expect(warned.every((event) => event.tick === 10)).toBe(true)
    session.advanceTo(10 + COLLAPSE_WARN_TICKS - 1)
    expect(ofType(session.events(), 'CollapseStarted')).toEqual([])
    session.advanceTo(10 + COLLAPSE_WARN_TICKS)
    const started = ofType(session.events(), 'CollapseStarted')
    expect(started.map(({ block }) => block).sort()).toEqual(
      warned.map(({ block }) => block).sort(),
    )
    expect(started.every((event) => event.tick === 10 + COLLAPSE_WARN_TICKS)).toBe(true)
    session.advanceTo(10 + COLLAPSE_WARN_TICKS + COLLAPSE_FILL_TICKS)
    expect(session.state().collapse.blocks).toEqual([])
  })

  it('cancels the warning when the tunnel is relined at the grade its band needs', () => {
    const session = createScriptedSession()
    buildWeakTunnel(session, 10)
    const warned = ofType(session.events(), 'CollapseWarned').map(({ block }) => block)
    session.submit(30, { type: 'debug.setCasingGrade', payload: { grade: 2 } })
    lineTunnel(session, 30, 2)
    session.advanceTo(200)
    const cancelled = ofType(session.events(), 'CollapseCancelled').map(({ block }) => block)
    expect([...cancelled].sort()).toEqual([...warned].sort())
    expect(ofType(session.events(), 'CollapseStarted')).toEqual([])
  })

  it('cancels when the vehicle goes beyond 16 m and restarts the full warning on its return', () => {
    const session = createScriptedSession()
    buildWeakTunnel(session, 10)
    const warned = ofType(session.events(), 'CollapseWarned').map(({ block }) => block)
    session.submit(40, poseAt(TUNNEL_MIDDLE_X + 40000, BAND_2_Y))
    session.advanceTo(300)
    const cancelled = ofType(session.events(), 'CollapseCancelled').map(({ block }) => block)
    expect([...cancelled].sort()).toEqual([...warned].sort())
    expect(ofType(session.events(), 'CollapseStarted')).toEqual([])
    session.submit(400, poseAt(TUNNEL_MIDDLE_X, BAND_2_Y))
    const rewarned = ofType(session.events(), 'CollapseWarned').filter(({ tick }) => tick === 400)
    expect(rewarned.length).toBeGreaterThan(0)
    session.advanceTo(400 + COLLAPSE_WARN_TICKS)
    const started = ofType(session.events(), 'CollapseStarted')
    expect(started.length).toBeGreaterThan(0)
    expect(started.every(({ tick }) => tick === 400 + COLLAPSE_WARN_TICKS)).toBe(true)
  })

  it('looks only at blocks near a vehicle, so a far weak tunnel stays frozen', () => {
    const session = createScriptedSession()
    session.submit(5, poseAt(TUNNEL_MIDDLE_X + 40000, BAND_2_Y))
    buildWeakTunnel(session, 10)
    session.submit(10, poseAt(TUNNEL_MIDDLE_X + 40000, BAND_2_Y))
    session.advanceTo(10 + 600)
    expect(ofType(session.events(), 'CollapseStarted')).toEqual([])
  })
})

describe('collapse: the vehicle caught inside (#43 vehicle safety, acceptance 4, 5)', () => {
  /** A 10 m band-1 tunnel, the vehicle stopped in it, its own block forced to collapse at 2000. */
  function forcedOnTheVehicle() {
    const session = createScriptedSession()
    prepareDigger(session, 0)
    const dug = digAlong(session, 0, BAND_1_Y, 20500, 30500)
    const back = digAlong(session, dug, BAND_1_Y, 30500, 26500, 0)
    const block = blockOfBody(26500, BAND_1_Y)
    session.submit(back, forceCollapseCommand(block))
    return { session, block, forcedAt: back, body: { x: 26500, y: BAND_1_Y } }
  }

  it('crushes a vehicle in the collapsing block once, by 8% of its hull, as source collapse', () => {
    const { session, forcedAt } = forcedOnTheVehicle()
    session.advanceTo(forcedAt + COLLAPSE_WARN_TICKS + COLLAPSE_FILL_TICKS)
    const crushes = ofType(session.events(), 'VehicleDamaged')
    expect(crushes).toHaveLength(1)
    expect(crushes[0]).toMatchObject({
      tick: forcedAt + COLLAPSE_WARN_TICKS,
      playerId: 'p1',
      source: 'collapse',
      amount: '8e+0',
      hullAfter: '9.2e+1',
      enemyId: null,
      kind: null,
    })
    expect(ofType(session.events(), 'CollapseStarted')[0].vehiclesHit).toBe(1)
  })

  it('shows the whole 60-tick warning before the crush', () => {
    const { session, forcedAt } = forcedOnTheVehicle()
    session.advanceTo(forcedAt + COLLAPSE_WARN_TICKS + COLLAPSE_FILL_TICKS)
    const [warning] = ofType(session.events(), 'CollapseWarned')
    const [crush] = ofType(session.events(), 'VehicleDamaged')
    expect(warning.tick).toBe(forcedAt)
    expect(crush.tick - warning.tick).toBeGreaterThanOrEqual(60)
  })

  it('never puts solid ground inside the vehicle and leaves it a pocket it can drill out of', () => {
    const { session, forcedAt, body } = forcedOnTheVehicle()
    const inside: { sx: number; sy: number }[] = []
    for (let sy = Math.floor((body.y - 450) / 250); sy * 250 <= body.y + 450; sy++) {
      for (let sx = Math.floor((body.x - 450) / 250); sx * 250 <= body.x + 450; sx++) {
        if (densityAt(session, sx, sy) <= 128) inside.push({ sx, sy })
      }
    }
    expect(inside.length).toBeGreaterThan(4)
    const settled = forcedAt + COLLAPSE_WARN_TICKS + COLLAPSE_FILL_TICKS
    session.advanceTo(settled)
    expect(inside.every(({ sx, sy }) => densityAt(session, sx, sy) <= 128)).toBe(true)
    session.submit(settled + 12, { type: 'debug.setEnergy', payload: { energy: '150' } })
    const drilled = session.submit(settled + 12, poseAt(body.x, body.y, 12, FACING.right))
    expect(ofType(drilled, 'DrillDamageDealt')[0]?.ticks).toBeGreaterThan(0)
  })

  it('credits no ore again for cells re-dug after a collapse', () => {
    const session = createScriptedSession()
    prepareDigger(session, 0)
    const dug = digAlong(session, 0, BAND_1_Y, 20500, 30500)
    const firstDig = ofType(session.events(), 'TileDestroyed').map(({ tx, ty }) => `${tx},${ty}`)
    expect(firstDig.length).toBeGreaterThan(10)
    const away = digAlong(session, dug, BAND_1_Y, 30500, 18500, 0)
    for (let x = 21000; x <= 30000; x += 4000) {
      session.submit(away, forceCollapseCommand(blockOfBody(x, BAND_1_Y)))
      session.submit(away, forceCollapseCommand(blockOfBody(x, BAND_1_Y - 4000)))
    }
    session.advanceTo(away + COLLAPSE_WARN_TICKS + COLLAPSE_FILL_TICKS)
    const before = session.events().length
    digAlong(session, away + 100, BAND_1_Y, 20500, 30500)
    const redug = session.events().slice(before)
    const again = ofType(redug, 'TileDestroyed').map(({ tx, ty }) => `${tx},${ty}`)
    expect(ofType(redug, 'GroundChanged').length).toBeGreaterThan(0)
    expect(again.filter((tile) => firstDig.includes(tile))).toEqual([])
  })
})

describe('collapse: determinism (#43 acceptance 6)', () => {
  it('fires the same collapse on the same tick with the same digest after a save mid-warning', () => {
    const session = createScriptedSession()
    buildWeakTunnel(session, 10)
    session.advanceTo(40)
    const loaded = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
    if (!('state' in loaded)) throw new Error(loaded.problems.join('; '))
    const original = advanceTicks(session.state(), 300)
    const resumed = advanceTicks(loaded.state, 300)
    expect(ofType(original.events, 'CollapseStarted')[0].tick).toBe(10 + COLLAPSE_WARN_TICKS)
    expect(resumed.events).toEqual(original.events)
    expect(stateDigest(resumed.state)).toBe(stateDigest(original.state))
  })

  it('keeps a co-op guest joined mid-warning on the host digest after the collapse (loopback)', () => {
    const start = createAuthorityState({
      planetIndex: 1,
      planetSeed: WORLD_SEED,
      playerIds: ['p1', 'p2'],
    })
    const host = createLoopbackAuthority(start)
    weakTunnelIntents().forEach((intent, at) =>
      host.submit({ playerId: 'p1', tick: 10, seq: at + 1, ...intent }),
    )
    const joined = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(host.snapshot().state))))
    if (!('state' in joined)) throw new Error(joined.problems.join('; '))
    const guest = createLoopbackAuthority(joined.state)
    const heard: DomainEvent[] = []
    host.subscribe((events) => heard.push(...events))
    const arrival: AuthorityCommand = { playerId: 'p2', tick: 50, seq: 1, ...poseAt(0, BAND_1_Y) }
    ;[host, guest].forEach((authority) => {
      authority.submit(arrival)
      authority.advanceTo(300)
    })
    expect(ofType(heard, 'CollapseStarted').length).toBeGreaterThan(0)
    expect(guest.snapshot().digest).toBe(host.snapshot().digest)
  })

  it('gives the same events and digest whatever the clock batches, at the fixed step and 1 s jumps', () => {
    const run = (stride: number) => {
      const session = createScriptedSession()
      buildWeakTunnel(session, 10)
      for (let tick = 10 + stride; tick < 400; tick += stride) session.advanceTo(tick)
      session.advanceTo(400)
      return { events: session.events(), digest: stateDigest(session.state()) }
    }
    const fixedStep = run(1)
    const jumps = run(60)
    expect(jumps.digest).toBe(fixedStep.digest)
    expect(jumps.events).toEqual(fixedStep.events)
  })
})

describe('collapse: the debug command (#43 debug API)', () => {
  it('refuses a block name that is not one, listing the problem and changing nothing', () => {
    const session = createScriptedSession()
    const before = stateDigest(session.state())
    const [refused] = session.submit(5, forceCollapseCommand('here'))
    expect(refused).toMatchObject({ type: 'CommandRejected', reason: 'invalid_payload' })
    expect(stateDigest(session.state())).toBe(before)
  })

  it('logs debug_command_applied and marks the session as debug', () => {
    const session = createScriptedSession()
    const events = session.submit(5, forceCollapseCommand(blockOfBody(20500, BAND_1_Y)))
    expect(ofType(events, 'DebugCommandApplied')).toHaveLength(1)
    expect(session.state().debugApplied).toBe(true)
  })
})
