import { describe, expect, it } from 'vitest'
import { MM_PER_METRE } from '../../../constants/physics'
import { chargeRadiusMm } from '../../economy/chargeSizes'
import { cellDensitySum } from '../../world/cellYield'
import { freshPlanetParamsFor } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
import { createAuthorityState, type AuthorityState } from '../authorityState'
import { poseAt } from '../collapse/collapseFixtures'
import type { DomainEvent } from '../domainEvent'
import { withSessionOnPlanet } from '../planetEntry'
import {
  continueScriptedSession,
  createScriptedSession,
  FREEZE_ENEMIES,
  PARAMS,
  WORLD_SEED,
  type ScriptedSession,
} from '../scriptedSession'
import { readSnapshot, takeSnapshot } from '../sessionSnapshot'
import { stateDigest } from '../stateDigest'
import { groundTilesSqOf } from './blastDisc'
import { inRadiusCount } from './blastFront'
import { detonatePlantedChargeAtLevel } from './chargeDetonation'
import {
  BACKED_OFF_TILE,
  ofType,
  plantOnWall,
  plantSized,
  poseOnTile,
  prepareBlaster,
  sizedBlasterOn,
  solidBlastSiteOn,
} from './chargeFixtures'
import { startLiveBlast } from './liveBlast'
import { blastAt, BLAST_TICK, liveBlastSession, SOLID_SITE } from './liveBlastFixtures'

const FUSE_TICKS = 120
const LEVELS = [0, 10, 1_000_000]
/** Size 4 opens on planet 16 and is the first with a lethal core (#153). */
const CORE_SIZE = 4
const CORE_PLANET = 16

/** Plants at tick 1 from the stand, backs off and lets the fuse blow it. */
function blastOnce(session: ScriptedSession, plantTick: number): DomainEvent[] {
  plantOnWall(session, plantTick)
  session.submit(plantTick + 1, poseOnTile(BACKED_OFF_TILE))
  const before = session.events().length
  session.advanceTo(plantTick + FUSE_TICKS + 5)
  return session.events().slice(before)
}

function densityOf(state: AuthorityState, tile: TilePoint): number {
  return cellDensitySum(state.world, PARAMS, tile)
}

/** A size-4 charge planted on planet 16, the planter then standing `metres` west of its centre. */
function plantedWithPlanterAt(metres: number): AuthorityState {
  const blaster = sizedBlasterOn(CORE_PLANET, CORE_SIZE)
  plantSized(blaster.session, blaster, CORE_SIZE, 1)
  const centreX = blaster.wall.tx * MM_PER_METRE + MM_PER_METRE / 2
  const centreY = blaster.wall.ty * MM_PER_METRE + MM_PER_METRE / 2
  blaster.session.submit(60, poseAt(centreX - metres * MM_PER_METRE, centreY))
  return blaster.session.state()
}

/** What the blast did to its planter at `radiusLevel`: its own events and its vehicle after. */
function planterAfterBlast(state: AuthorityState, radiusLevel: number) {
  const blown = detonatePlantedChargeAtLevel(state, 'p1', { tick: 61, by: 'fuse', radiusLevel })
  const { hull, mode } = blown.state.players.p1.vehicle
  const ownEvents = blown.events.filter(
    ({ type }) => type !== 'BlastStarted' && type !== 'ChargeDetonated',
  )
  return { hull, mode, ownEvents }
}

/** A live blast of `size` at `radiusLevel` on planet `planetIndex`, run for `ticks` ticks. */
function replayedBlast(planetIndex: number, radiusLevel: number, ticks: number) {
  const start = createAuthorityState({ planetIndex, planetSeed: WORLD_SEED, playerIds: ['p1'] })
  const session = continueScriptedSession(start)
  session.submit(0, FREEZE_ENEMIES)
  const blast = { ...blastAt(solidBlastSiteOn(planetIndex).wall, 2500), radiusLevel }
  const live = continueScriptedSession(startLiveBlast(session.state(), blast))
  live.advanceTo(BLAST_TICK + ticks)
  return { digest: stateDigest(live.state()), events: JSON.stringify(live.events()) }
}

describe('blast disc record (ticket 860)', () => {
  it("logs the blast's disc record beside its detonation: rung, type, level 0, both r² and its number", () => {
    const session = createScriptedSession()
    prepareBlaster(session, 0)
    const events = blastOnce(session, 1)
    const detonated = events.findIndex(({ type }) => type === 'ChargeDetonated')
    expect(events[detonated + 1]).toEqual({
      type: 'BlastStarted',
      tick: 1 + FUSE_TICKS,
      playerId: 'p1',
      tx: -20,
      ty: expect.any(Number),
      size: 1,
      chargeType: 1,
      radiusLevel: 0,
      baseR2: '400',
      groundR2: '400',
      blastSeq: 0,
      casingLaid: false,
    })
  })

  it('numbers every blast of the session in turn and saves the counter with it', () => {
    const session = createScriptedSession()
    prepareBlaster(session, 0)
    const first = ofType(blastOnce(session, 1), 'BlastStarted')
    const second = ofType(blastOnce(session, 200), 'BlastStarted')
    expect([...first, ...second].map(({ blastSeq }) => blastSeq)).toEqual([0, 1])
    const snapshot = JSON.parse(JSON.stringify(takeSnapshot(session.state())))
    expect(snapshot.state.blastSeq).toBe(2)
    const restored = readSnapshot(snapshot)
    expect('state' in restored && restored.state).toEqual(session.state())
  })

  it('keeps no counter in a session that never blasts, so its snapshot is as before', () => {
    const state = createScriptedSession().state()
    expect('blastSeq' in takeSnapshot(state).state).toBe(false)
    expect('blastSeq' in state).toBe(false)
  })

  it('keeps the counter when the session moves to another planet', () => {
    const session = createScriptedSession()
    prepareBlaster(session, 0)
    blastOnce(session, 1)
    const moved = withSessionOnPlanet(session.state(), { index: 2, seed: WORLD_SEED })
    expect(moved.blastSeq).toBe(1)
  })
})

describe('blast disc golden at L = 0, 10 and 1e6 (ticket 860)', () => {
  it('hits the planter the same at every level: wrecked in the core, hit in the base radius, untouched past it', () => {
    for (const metres of [2, 5, 7.5]) {
      const planted = plantedWithPlanterAt(metres)
      const [atZero, ...widened] = LEVELS.map((level) => planterAfterBlast(planted, level))
      for (const outcome of widened) expect(outcome).toEqual(atZero)
    }
    expect(planterAfterBlast(plantedWithPlanterAt(2), 1_000_000).mode).toBe('destroyed')
    expect(planterAfterBlast(plantedWithPlanterAt(7.5), 1_000_000).ownEvents).toEqual([])
  })

  it('clears the widened ground disc at L = 10, past the rung radius, and leaves the planter an open way back', () => {
    const rig = { tx: SOLID_SITE.tx - 7, ty: SOLID_SITE.ty }
    const wide = liveBlastSession(
      [blastAt(SOLID_SITE, chargeRadiusMm(CORE_SIZE), { size: CORE_SIZE, radiusLevel: 10 })],
      ['p1'],
      (session) => session.submit(0, poseOnTile(rig)),
    )
    wide.advanceTo(BLAST_TICK + 60)
    const [resolved] = ofType(wide.events(), 'BlastResolved')
    const disc = { radiusMm: chargeRadiusMm(CORE_SIZE), radiusLevel: 10 }
    expect(resolved.tilesCleared).toBe(inRadiusCount(groundTilesSqOf(disc, PARAMS)))
    expect(resolved.tilesCleared).toBeGreaterThan(inRadiusCount(36))
    const wayBack = Array.from({ length: 8 }, (_, step) => ({ tx: rig.tx + step, ty: rig.ty }))
    expect(wayBack.filter((tile) => densityOf(wide.state(), tile) > 0)).toEqual([])
  })

  it('breaks the planet-wide disc of L = 1e6 a slice a tick, nearest first, clearing the planter cell and refilling none', () => {
    const rig = { tx: SOLID_SITE.tx - 5, ty: SOLID_SITE.ty }
    const planetWide = liveBlastSession(
      [blastAt(SOLID_SITE, chargeRadiusMm(1), { radiusLevel: 1_000_000 })],
      ['p1'],
      (session) => session.submit(0, poseOnTile(rig)),
    )
    planetWide.advanceTo(BLAST_TICK + 9)
    expect(ofType(planetWide.events(), 'BlastFront')).toHaveLength(10)
    expect(densityOf(planetWide.state(), rig)).toBe(0)
    expect(ofType(planetWide.events(), 'CollapseStarted')).toEqual([])
    expect(planetWide.state().liveBlasts).toHaveLength(1)
  })
})

describe('blast replay (ticket 860)', () => {
  it('replays a live blast byte for byte at g = 1, 5, 30, 40 and 1e6 and L = 0, 10 and 1e6', () => {
    for (const planetIndex of [1, 5, 30, 40, 1_000_000]) {
      for (const level of LEVELS) {
        expect(replayedBlast(planetIndex, level, 12)).toEqual(replayedBlast(planetIndex, level, 12))
      }
    }
  })

  it('takes the same ground at L = 0 as the rung radius took before the disc record', () => {
    const params = freshPlanetParamsFor(WORLD_SEED, 1)
    const disc = { radiusMm: 24 * MM_PER_METRE, radiusLevel: 0 }
    expect(inRadiusCount(groundTilesSqOf(disc, params))).toBe(1793)
  })
})
