import { describe, expect, it } from 'vitest'
import { MM_PER_METRE } from '../../../constants/physics'
import { projectDomainEvent } from '../../../logging/domainEventLog'
import { hashCell } from '../../cellRandom'
import { keptBlastOreUnits } from '../../economy/blastingCharges'
import { div, fromSafeInteger } from '../../money'
import { cellDensitySum } from '../../world/cellYield'
import type { TilePoint } from '../../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../world/worldState'
import { resourceTierOf } from '../minedOre'
import { continueScriptedSession, coreTiles, PARAMS, WORLD_SEED } from '../scriptedSession'
import { readSnapshot, takeSnapshot } from '../sessionSnapshot'
import { stateDigest } from '../stateDigest'
import { blastFrontOf, inRadiusCount } from './blastFront'
import { ofType } from './chargeFixtures'
import { BLAST_TICK, blastAt, liveBlastSession, R24_MM, SOLID_SITE } from './liveBlastFixtures'

/** Past an R24 blast's 29 slices and the rim checks after them. */
const SETTLED_TICK = BLAST_TICK + 60

function frontTilesOf(site: TilePoint, radiusMm: number): TilePoint[] {
  return blastFrontOf(radiusMm).map(({ dx, dy }) => ({ tx: site.tx + dx, ty: site.ty + dy }))
}

function densityOfTile(session: ReturnType<typeof liveBlastSession>, tile: TilePoint): number {
  return cellDensitySum(session.state().world, PARAMS, tile)
}

/** The ticks a blast's front moved on, one per slice. */
function sliceTicksOf(session: ReturnType<typeof liveBlastSession>): number[] {
  return ofType(session.events(), 'BlastFront').map(({ tick }) => tick)
}

describe('live blast', () => {
  it('clears a blast in solid rock in ceil(inRadiusCount / 64) ticks, 64 tiles a tick, for R4 to R24', () => {
    for (let radius = 4; radius <= 24; radius++) {
      const radiusMm = radius * MM_PER_METRE
      const session = liveBlastSession([blastAt(SOLID_SITE, radiusMm)])
      session.advanceTo(SETTLED_TICK)
      const slices = Math.ceil(inRadiusCount(radiusMm) / 64)
      expect(sliceTicksOf(session)).toEqual(
        Array.from({ length: slices }, (_, k) => BLAST_TICK + k),
      )
      const [resolved] = ofType(session.events(), 'BlastResolved')
      expect(resolved.tilesCleared).toBe(inRadiusCount(radiusMm))
    }
  })

  it('clears the R24 blast of 1,793 tiles in 29 ticks and leaves no ground in its radius', () => {
    const session = liveBlastSession([blastAt(SOLID_SITE, R24_MM)])
    session.advanceTo(BLAST_TICK + 28)
    expect(sliceTicksOf(session)).toHaveLength(29)
    const front = frontTilesOf(SOLID_SITE, R24_MM)
    expect(front.filter((tile) => densityOfTile(session, tile) > 0)).toEqual([])
  })

  it('opens the crater outward: nearest tiles first, the rest of the rock still standing', () => {
    const session = liveBlastSession([blastAt(SOLID_SITE, R24_MM)])
    session.advanceTo(BLAST_TICK + 9)
    const front = frontTilesOf(SOLID_SITE, R24_MM)
    const cleared = front.map((tile) => densityOfTile(session, tile) === 0)
    expect(cleared.slice(0, 640)).toEqual(Array(640).fill(true))
    expect(cleared.slice(640)).toEqual(Array(front.length - 640).fill(false))
  })

  it('says where its front is once per slice tick, its outer radius growing', () => {
    const session = liveBlastSession([blastAt(SOLID_SITE, R24_MM)])
    session.advanceTo(SETTLED_TICK)
    const fronts = ofType(session.events(), 'BlastFront')
    expect(fronts).toHaveLength(29)
    expect(fronts[0]).toMatchObject({ ...SOLID_SITE, rInnerMm: 0 })
    expect(fronts.at(-1)?.rOuterMm).toBe(R24_MM)
    // The last slice's one tile sits on the 24-tile ring with the slice before's last.
    const isGrowing = fronts.every(
      (front, at) => at === 0 || front.rOuterMm >= fronts[at - 1].rOuterMm,
    )
    expect(isGrowing).toBe(true)
    expect(new Set(fronts.map(({ rOuterMm }) => rOuterMm)).size).toBe(fronts.length - 1)
    const isEachRingNext = fronts.every(
      (front, at) => at === 0 || front.rInnerMm >= fronts[at - 1].rOuterMm,
    )
    expect(isEachRingNext).toBe(true)
  })

  it('keeps the ore units one break of the whole blast would: floor(n * 0.4 + d) per tier', () => {
    const session = liveBlastSession([blastAt(SOLID_SITE, R24_MM)])
    session.advanceTo(SETTLED_TICK)
    const [resolved] = ofType(session.events(), 'BlastResolved')
    expect(resolved.oreUnits).toBe(expectedKeptUnits(SOLID_SITE, R24_MM))
    expect(resolved.oreUnits).toBeGreaterThan(0)
  })

  it('leaves core tiles standing and does not count them against the 64 a tick', () => {
    const [topCore] = coreTiles(1)
    const site = { tx: topCore.tx, ty: topCore.ty + 4 }
    const radiusMm = 12 * MM_PER_METRE
    const session = liveBlastSession([blastAt(site, radiusMm)])
    session.advanceTo(SETTLED_TICK)
    const core = frontTilesOf(site, radiusMm).filter(
      (tile) => kindOfCell(cellAt(EMPTY_WORLD, PARAMS, tile)) === CELL_KIND.core,
    )
    expect(core.length).toBeGreaterThan(64)
    expect(core.filter((tile) => densityOfTile(session, tile) === 0)).toEqual([])
    const [resolved] = ofType(session.events(), 'BlastResolved')
    expect(sliceTicksOf(session)).toHaveLength(Math.ceil(resolved.tilesCleared / 64))
  })

  it('shares 64 tiles a tick between live blasts, the oldest first', () => {
    const other = { tx: SOLID_SITE.tx + 3, ty: SOLID_SITE.ty + 3 }
    const session = liveBlastSession(
      [blastAt(SOLID_SITE, 6 * MM_PER_METRE), blastAt(other, 6 * MM_PER_METRE, { playerId: 'p2' })],
      ['p1', 'p2'],
    )
    session.advanceTo(SETTLED_TICK)
    const resolved = ofType(session.events(), 'BlastResolved')
    const cleared = resolved.reduce((total, blast) => total + blast.tilesCleared, 0)
    const sliceTicks = new Set(sliceTicksOf(session))
    expect(sliceTicks.size).toBe(Math.ceil(cleared / 64))
    const firstOfOther = ofType(session.events(), 'BlastFront').find(
      ({ playerId }) => playerId === 'p2',
    )
    const lastOfOldest = ofType(session.events(), 'BlastFront')
      .filter(({ playerId }) => playerId === 'p1')
      .at(-1)
    expect(firstOfOther?.tick).toBe(lastOfOldest?.tick)
  })

  it('logs exactly one blast_resolved line and no tile_destroyed line for the blast', () => {
    const session = liveBlastSession([blastAt(SOLID_SITE, R24_MM)])
    session.advanceTo(SETTLED_TICK)
    const lines = session
      .events()
      .map(projectDomainEvent)
      .flatMap((projected) => (projected === null ? [] : [projected.line.event]))
    expect(lines.filter((name) => name === 'blast_resolved')).toHaveLength(1)
    expect(lines.filter((name) => name === 'tile_destroyed')).toEqual([])
  })

  it('gives the same state whether the clock moves a tick at a time or in one jump', () => {
    const stepped = liveBlastSession([blastAt(SOLID_SITE, R24_MM)])
    for (let tick = 1; tick <= SETTLED_TICK; tick++) stepped.advanceTo(tick)
    const jumped = liveBlastSession([blastAt(SOLID_SITE, R24_MM)])
    jumped.advanceTo(SETTLED_TICK)
    expect(stepped.events()).toEqual(jumped.events())
    expect(stateDigest(stepped.state())).toBe(stateDigest(jumped.state()))
  })

  it('finishes the same crater after a save mid-blast and a load', () => {
    const whole = liveBlastSession([blastAt(SOLID_SITE, R24_MM)])
    whole.advanceTo(SETTLED_TICK)
    const saved = liveBlastSession([blastAt(SOLID_SITE, R24_MM)])
    saved.advanceTo(BLAST_TICK + 12)
    expect(saved.state().liveBlasts).toHaveLength(1)
    const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(saved.state()))))
    if (!('state' in restored)) throw new Error(restored.problems.join('; '))
    const loaded = continueScriptedSession(restored.state)
    loaded.advanceTo(SETTLED_TICK)
    expect(stateDigest(loaded.state())).toBe(stateDigest(whole.state()))
    expect(ofType(loaded.events(), 'BlastResolved')).toEqual(
      ofType(whole.events(), 'BlastResolved'),
    )
  })
})

/** Of each tier's ore units in the radius, the kept share of one break, as #109 counts it. */
function expectedKeptUnits(site: TilePoint, radiusMm: number): number {
  const dither = div(
    fromSafeInteger(hashCell(WORLD_SEED, site.tx, site.ty)),
    fromSafeInteger(0x100000000),
  )
  const unitsByTier = new Map<number, number>()
  for (const tile of frontTilesOf(site, radiusMm)) {
    const cell = cellAt(EMPTY_WORLD, PARAMS, tile)
    if (kindOfCell(cell) !== CELL_KIND.ore) continue
    const tier = resourceTierOf(PARAMS, cell)
    unitsByTier.set(tier, (unitsByTier.get(tier) ?? 0) + 1)
  }
  return [...unitsByTier.values()].reduce(
    (total, units) => total + keptBlastOreUnits(units, dither),
    0,
  )
}
