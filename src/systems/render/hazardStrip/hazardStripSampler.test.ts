import { describe, expect, it } from 'vitest'
import { COLLAPSE_FILL_TICKS, COLLAPSE_WARN_TICKS } from '../../../constants/balance'
import { blockContaining, blockIdOf } from '../../world/collapseBlock'
import { createHazardStrip, sampleHazardStrip, type HazardStrip } from './hazardStripSampler'
import {
  cacheAt,
  createFixtureGround,
  digFrameAt,
  FIXTURE_START,
  gateAt,
  lavaAt,
  oreAt,
  VIEWER_BEFORE_SCANNER,
  VIEWER_WITH_SCANNER,
  type FixtureGround,
  type LineFixture,
} from './stripFixtures'
import type { StripPip, StripViewer } from './stripPips'
import { gapStepsWithin } from './stripSegments'
import { STRIP_TIER } from './stripTiers'

const FRAME_SECONDS = 1 / 60
/** A coarse pip sits at the start of its 8 m lattice block, a line's width before the hazard. */
const COARSE_LEAD_M = 10

/** The rig runs up for 3 s first, so the fixtures lie past the 2 s window at the start. */
function runUpOf(speed: number): number {
  return 3 * speed
}

function visiblePips(strip: HazardStrip): StripPip[] {
  return strip.pips.slice(0, strip.pipCount)
}

/** Plays a dig at `speed` past the last fixture, calling `onFrame` after each frame. */
function playDig(
  ground: FixtureGround,
  speed: number,
  untilMetres: number,
  onFrame: (strip: HazardStrip, seconds: number) => void,
  viewer: StripViewer = VIEWER_BEFORE_SCANNER,
): void {
  const strip = createHazardStrip()
  for (let frame = 0; frame * FRAME_SECONDS * speed <= untilMetres; frame++) {
    const seconds = frame * FRAME_SECONDS
    sampleHazardStrip(strip, ground, digFrameAt(seconds, speed, viewer))
    onFrame(strip, seconds)
  }
}

/** Seconds of warning each lava fixture had: from its first pip near it to the rig's arrival. */
function warningSecondsOf(speed: number, lavaMetres: readonly number[]): number[] {
  const placed = lavaMetres.map((metres) => runUpOf(speed) + metres)
  const ground = createFixtureGround(placed.map(lavaAt))
  const firstSeen = placed.map(() => Infinity)
  playDig(ground, speed, placed[placed.length - 1], (strip, seconds) => {
    placed.forEach((metres, at) => {
      if (firstSeen[at] !== Infinity) return
      const isShown = visiblePips(strip).some(
        (pip) => pip.kind === 'lava' && isNear(strip.window.at + pip.metres, metres),
      )
      if (isShown) firstSeen[at] = seconds
    })
  })
  return placed.map((metres, at) => metres / speed - firstSeen[at])
}

function isNear(pipMetres: number, fixtureMetres: number): boolean {
  return pipMetres <= fixtureMetres + 1 && pipMetres >= fixtureMetres - COARSE_LEAD_M
}

describe('hazard strip sampler', () => {
  it.each([20, 50, 100, 1000, 10_000])(
    'shows lava at 50, 100 and 200 m as a pip at least 1.0 s before the rig reaches it, at %i m/s',
    (speed) => {
      for (const warning of warningSecondsOf(speed, [50, 100, 200])) {
        expect(warning).toBeGreaterThanOrEqual(1)
      }
    },
  )

  it.each([20, 100, 1000, 10_000])(
    'spends no more than the 0.5 ms budget a frame and covers the whole window, at %i m/s',
    (speed) => {
      const ground = createFixtureGround([lavaAt(runUpOf(speed) + 50)])
      playDig(ground, speed, runUpOf(speed) + 100, (strip) => {
        expect(strip.spentUs).toBeLessThanOrEqual(500)
        expect(gapStepsWithin(strip.segments, strip.fromStep, strip.toStep)).toBe(0)
        expect(strip.toStep - strip.window.at).toBeGreaterThanOrEqual(2 * speed)
      })
    },
  )

  it('reads a cold 2 km window by its bands first, then makes it exact within a second', () => {
    const ground = createFixtureGround([lavaAt(5000)])
    const tiers: number[] = []
    playDig(ground, 1000, 1000, (strip) => tiers.push(strip.tier))
    expect(tiers[0]).toBe(STRIP_TIER.band)
    expect(tiers.slice(60)).toEqual(tiers.slice(60).map(() => STRIP_TIER.exact))
  })

  it('reads coarser at 10,000 m/s than exact sampling can pay for, and never misses the lava', () => {
    const tiers = new Set<number>()
    const ground = createFixtureGround([lavaAt(runUpOf(10_000) + 50)])
    playDig(ground, 10_000, runUpOf(10_000), (strip) => tiers.add(strip.tier))
    expect(tiers.has(STRIP_TIER.lattice)).toBe(true)
  })

  it('re-reads a stretch whose chunk was edited, and shows the lava that flowed there', () => {
    const ground = createFixtureGround([])
    const strip = createHazardStrip()
    sampleHazardStrip(strip, ground, digFrameAt(0, 0, VIEWER_BEFORE_SCANNER))
    expect(strip.pipCount).toBe(0)
    ground.editLine(lavaAt(10))
    sampleHazardStrip(strip, ground, digFrameAt(0, 0, VIEWER_BEFORE_SCANNER))
    expect(visiblePips(strip).map((pip) => [pip.kind, pip.metres])).toEqual([['lava', 10]])
  })

  it('places a pip by its time to arrival along the strip, the same at any speed', () => {
    const places = [20, 1000].map((speed) => {
      const [pip] = settledPipsOf([lavaAt(speed)], speed, VIEWER_BEFORE_SCANNER)
      return [pip.seconds, pip.place]
    })
    expect(places).toEqual([
      [1, 0.5],
      [1, 0.5],
    ])
  })

  it('shows no ore before scanner_station, and top-tier ore after it with the hazards unchanged', () => {
    const fixtures = [lavaAt(30), oreAt(12, 2), oreAt(20, 0), cacheAt(40), oreAt(60, 3)]
    const before = pipsAtRestOver(fixtures, VIEWER_BEFORE_SCANNER)
    const after = pipsAtRestOver(fixtures, VIEWER_WITH_SCANNER)
    const hazardsOf = (pips: StripPip[]) => pips.filter((pip) => pip.kind !== 'ore')
    expect(before.map((pip) => pip.kind)).toEqual(['lava', 'cache'])
    expect(after.filter((pip) => pip.kind === 'ore').map((pip) => pip.metres)).toEqual([12, 60])
    expect(hazardsOf(after)).toEqual(hazardsOf(before))
  })

  it('shows a gate by its kind alone, beside a cache, never what opens it or lies inside', () => {
    const fixtures = [gateAt(10, 3), cacheAt(20)]
    const pips = pipsAtRestOver(fixtures, VIEWER_WITH_SCANNER)
    expect(pips.map((pip) => [pip.kind, pip.gateKind])).toEqual([
      ['gate', 3],
      ['cache', -1],
    ])
    for (const pip of pips) {
      expect(Object.keys(pip).sort()).toEqual(
        ['gateKind', 'isCoarse', 'kind', 'metres', 'place', 'seconds'].sort(),
      )
    }
  })

  it("drops a gate pip once the rig's tip opens it", () => {
    const opensAtTwo: LineFixture = {
      metres: 10,
      hit: { ...gateAt(10, 1).hit, gateOpensAtTipMajor: 2 },
    }
    const shut = pipsAtRestOver([opensAtTwo], { ...VIEWER_BEFORE_SCANNER, tipMajor: 1 })
    const open = pipsAtRestOver([opensAtTwo], { ...VIEWER_BEFORE_SCANNER, tipMajor: 2 })
    expect(shut.map((pip) => pip.kind)).toEqual(['gate'])
    expect(open).toEqual([])
  })

  it('shows a collapse-warned block on the line until it has settled', () => {
    const block = blockContaining({ xMm: 500, yMm: (FIXTURE_START.y - 20) * 1000 })
    const collapse = { blocks: [{ block: blockIdOf(block), startTick: 0, isForced: false }] }
    const ground = createFixtureGround([])
    const kindsAt = (tick: number) => {
      const strip = createHazardStrip()
      sampleHazardStrip(strip, ground, {
        ...digFrameAt(0, 15, VIEWER_BEFORE_SCANNER),
        collapse,
        tick,
      })
      return visiblePips(strip).map((pip) => [pip.kind, Math.floor(pip.metres)])
    }
    // The block's centre is 20.5 m down the line; the line may meet its corner 2.8 m sooner.
    expect(kindsAt(0)).toEqual([['collapse', 17]])
    expect(kindsAt(COLLAPSE_WARN_TICKS + COLLAPSE_FILL_TICKS)).toEqual([])
  })

  it('never shows more than 8 pips, nearest first', () => {
    const fixtures = Array.from({ length: 12 }, (_, at) => lavaAt(23 - 2 * at))
    const pips = pipsAtRestOver(fixtures, VIEWER_BEFORE_SCANNER)
    expect(pips.map((pip) => pip.metres)).toEqual([1, 3, 5, 7, 9, 11, 13, 15])
  })
})

/** The pips at the start once the window has settled, its 2 s reaching the farthest fixture. */
function pipsAtRestOver(fixtures: readonly LineFixture[], viewer: StripViewer): StripPip[] {
  const speed = Math.max(...fixtures.map((fixture) => fixture.metres)) / 2
  return settledPipsOf(fixtures, speed, viewer)
}

/** The pips at the start after a second of frames there, so every stretch has been made exact. */
function settledPipsOf(
  fixtures: readonly LineFixture[],
  speed: number,
  viewer: StripViewer,
): StripPip[] {
  const ground = createFixtureGround(fixtures)
  const strip = createHazardStrip()
  for (let frame = 0; frame < 60; frame++)
    sampleHazardStrip(strip, ground, digFrameAt(0, speed, viewer))
  return visiblePips(strip).map((pip) => ({ ...pip }))
}
