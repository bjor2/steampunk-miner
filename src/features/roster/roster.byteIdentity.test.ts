import { describe, expect, it } from 'vitest'
import { resourceTierOf } from '../../systems/authority/minedOre'
import { planetParamsOf } from '../../systems/authority/planetOfState'
import { takeSnapshot } from '../../systems/authority/sessionSnapshot'
import { fnv1a64Hex } from '../../systems/authority/stateDigest'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { oreTypeOf } from '../../systems/registries/oreTypes'
import { GOLDEN_SCRIPTS, stampScript } from '../../systems/replay/goldenScripts'
import { replayRun } from '../../systems/replay/replayRun'
import { readSaveSlot, saveSlotOf } from '../../systems/save/saveSlot'
import { generateChunkCells } from '../../systems/world/generateChunk'
import { freshPlanetParamsFor, type PlanetParams } from '../../systems/world/planetParams'
import { starterVeinTiles } from '../../systems/world/starterVein'
import { CHUNK_SIZE, chunkRangeOfDisc, firstTileOfChunk } from '../../systems/world/tileGrid'
import {
  CELL_KIND,
  familyOfCell,
  kindOfCell,
  kindSlotOfCell,
  withoutKindSlot,
  type ResourceFamily,
} from '../../systems/world/worldCell'
import { cellGateOf } from '../mining-gates'
import { oreFamilies, rarityTiers } from '../ores'
import {
  maskedCountsOf,
  NAMED_SEEDS,
  patchDrawsOf,
  planetCensusOf,
  withRosterOff,
  type PatchDraw,
  type PlanetCensus,
} from './rosterFixtures'
import { planetRosterOf } from './systems/planetRoster'
import { liveRosterIndicesOf } from './systems/rosterFold'

// `roster.byteIdentity.test` (TD ruling on ticket 446, 6226236698 section 5, addendum 6226264758
// amendment 4). A: the roster fold off against on changes no masked cell, density, band count or
// family histogram (the pacing seeds here, all 64 in `roster.byteIdentity.lane.test.ts`). B: the
// masked P1 and P2 cells and their per-band, per-family and per-tier counts are main's at f49323ba.
// C: the properties of the drawn roster. D, the pacing line, is `roster.pacing.lane.test.ts`.

/** Main's masked digests at f49323ba (generator 9), over the 8 named seeds, P1 then P2. */
const MAIN_MASKED_DIGESTS: Readonly<Record<number, string>> = {
  1: '5bc659f9dc0bb085',
  2: 'c7b0db9f0903fa37',
}

/** The roster golden: every roster of P1 to P5, and the kinds P1 and P2 patches drew. */
const ROSTER_GOLDEN = {
  rosters: '5700838e38882505',
  draws: { 1: '45eef63f1b02d27f', 2: '06187be540d8ba5c' } as Readonly<Record<number, string>>,
}

/** Whole planets 1 and 2 take about a second each; P3 to P5 are judged on one seed here. */
const PLANET_TIMEOUT_MS = 120_000
const FIRST_SEED = NAMED_SEEDS[0]
/** Part A here runs the three pacing seeds; the lane runs all 64. */
const PART_A_SEEDS = NAMED_SEEDS.slice(0, 3)
/** Binomial tolerance on the patch draws: 4 sigma (TD amendment 4). */
const SIGMA_TOLERANCE = 4

/** The Vertical Scaler's planet bounds: a common kind 4000 bp of the planet, any other 1500. */
const COMMON_PLANET_BOUND_BP = 4000
const RARE_BOUND_BP = 1500

const censusCache = new Map<string, PlanetCensus>()

/** The stamped planet's census, kept for the other checks of this file. */
function censusOf(params: PlanetParams): PlanetCensus {
  const key = `${params.worldSeed}:${params.planetIndex}`
  const kept = censusCache.get(key) ?? planetCensusOf(params)
  censusCache.set(key, kept)
  return kept
}

/** The masked digest of the 8 named seeds of a planet, as main recorded it. */
function namedMaskedDigestOf(planetIndex: number): string {
  const digests = NAMED_SEEDS.map(
    (seed) => censusOf(freshPlanetParamsFor(seed, planetIndex)).maskedDigest,
  )
  return fnv1a64Hex(digests.join(''))
}

function drawsDigestOf(planetIndex: number): string {
  const draws = NAMED_SEEDS.flatMap((seed) => patchDrawsOf(freshPlanetParamsFor(seed, planetIndex)))
  return fnv1a64Hex(draws.map((draw) => draw.kindSlot).join(','))
}

interface PlacedOre {
  cell: number
  tile: { tx: number; ty: number }
}

/** Every ore cell of the column of chunks through the planet's centre, with its tile. */
function centreColumnOreOf(params: PlanetParams): PlacedOre[] {
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  const ore: PlacedOre[] = []
  for (let cy = min; cy <= max; cy++) {
    generateChunkCells(params, 0, cy).forEach((cell, index) => {
      if (kindOfCell(cell) !== CELL_KIND.ore) return
      const tx = firstTileOfChunk(0) + (index % CHUNK_SIZE)
      ore.push({ cell, tile: { tx, ty: firstTileOfChunk(cy) + Math.floor(index / CHUNK_SIZE) } })
    })
  }
  return ore
}

interface KindShare {
  kindSlot: number
  isCommon: boolean
  shareBp: number
}

/**
 * Each drawn kind's share of the planet's ore value, in whole basis points: a cell is worth
 * `1.5^tierOffset` of the band-1 ore, so the shares are the census weighted by `3^k / 2^k`.
 */
function planetKindSharesBpOf(census: PlanetCensus): KindShare[] {
  const valueOf = (row: (typeof census.rows)[number]) => row.cells * 1.5 ** row.tierOffset
  const total = census.rows.reduce((sum, row) => sum + valueOf(row), 0)
  const byKind = new Map<number, KindShare>()
  for (const row of census.rows.filter((entry) => entry.kindSlot > 0)) {
    const kept = byKind.get(row.kindSlot)
    const isCommon = row.tierOffset === row.band - 1
    const shareBp = (kept?.shareBp ?? 0) + (valueOf(row) * 10000) / total
    byKind.set(row.kindSlot, { kindSlot: row.kindSlot, isCommon, shareBp })
  }
  return [...byKind.values()].map((share) => ({ ...share, shareBp: Math.round(share.shareBp) }))
}

/** The patch draws grouped by their (band, lead, family) cell. */
function drawGroupsOf(draws: readonly PatchDraw[]): PatchDraw[][] {
  const groups = new Map<string, PatchDraw[]>()
  for (const draw of draws) {
    const key = `${draw.band}:${draw.lead}:${draw.family}`
    groups.set(key, [...(groups.get(key) ?? []), draw])
  }
  return [...groups.values()]
}

describe('roster byte identity: A, the fold off against on', () => {
  it.each([1, 2])(
    'leaves every masked cell, density and ore count of planet %i as the fold-off planet has it, on the pacing seeds',
    (planetIndex) => {
      for (const seed of PART_A_SEEDS) {
        const params = freshPlanetParamsFor(seed, planetIndex)
        const off = withRosterOff(() => planetCensusOf(params))
        expect(off.maskedDigest).toBe(censusOf(params).maskedDigest)
        expect(maskedCountsOf(censusOf(params).rows)).toEqual(maskedCountsOf(off.rows))
        expect(off.rows.every((row) => row.kindSlot === 0)).toBe(true)
      }
    },
    PLANET_TIMEOUT_MS,
  )

  it.each([3, 4, 5])(
    'leaves every masked cell, density and ore count of planet %i as the fold-off planet has it',
    (planetIndex) => {
      const params = freshPlanetParamsFor(FIRST_SEED, planetIndex)
      const off = withRosterOff(() => planetCensusOf(params))
      expect(off.maskedDigest).toBe(planetCensusOf(params).maskedDigest)
    },
    PLANET_TIMEOUT_MS,
  )
})

describe('roster byte identity: B, planets 1 and 2 as main made them', () => {
  it.each([1, 2])(
    'keeps the masked cells and the per-band, per-family and per-tier counts of planet %i main had at f49323ba',
    (planetIndex) => {
      expect(namedMaskedDigestOf(planetIndex)).toBe(MAIN_MASKED_DIGESTS[planetIndex])
    },
    PLANET_TIMEOUT_MS,
  )
})

describe('roster byte identity: C, the drawn roster', () => {
  it(
    'pins the rosters of planets 1 to 5 and the kinds the P1 and P2 patches drew',
    () => {
      const rosters = [1, 2, 3, 4, 5].map((index) =>
        planetRosterOf(freshPlanetParamsFor(FIRST_SEED, index)).map((slot) => slot.slotId),
      )
      expect({
        rosters: fnv1a64Hex(JSON.stringify(rosters)),
        draws: { 1: drawsDigestOf(1), 2: drawsDigestOf(2) },
      }).toEqual(ROSTER_GOLDEN)
    },
    PLANET_TIMEOUT_MS,
  )

  it.each([1, 2])(
    'draws every kind of planet %i on a cell of its own family and rarity, inside its window',
    (planetIndex) => {
      for (const seed of NAMED_SEEDS) {
        const params = freshPlanetParamsFor(seed, planetIndex)
        const roster = planetRosterOf(params)
        const misplaced = censusOf(params).rows.filter((row) => {
          if (row.kindSlot === 0) return false
          const slot = roster[row.kindSlot - 1]
          const family = oreFamilies().find((entry) => entry.cellCode === row.family)?.id
          const rarity = rarityTiers()[row.tierOffset - (row.band - 1)]?.id
          const isInWindow = row.band >= slot.window[0] && row.band <= slot.window[1]
          return slot.family !== family || slot.rarity !== rarity || !isInWindow
        })
        expect(misplaced).toEqual([])
      }
    },
    PLANET_TIMEOUT_MS,
  )

  it.each([1, 2])(
    'leaves no patch of a painted (band, tier, family) cell of planet %i bare: only the starter vein is',
    (planetIndex) => {
      for (const seed of NAMED_SEEDS) {
        const params = freshPlanetParamsFor(seed, planetIndex)
        const bare = patchDrawsOf(params).filter((draw) => draw.kindSlot === 0)
        expect(bare).toEqual([])
        const bareCells = censusOf(params).rows.filter((row) => row.kindSlot === 0)
        const veinCells = planetIndex === 1 ? starterVeinTiles(params).length : 0
        expect(bareCells.reduce((sum, row) => sum + row.cells, 0)).toBeLessThanOrEqual(veinCells)
      }
    },
    PLANET_TIMEOUT_MS,
  )

  it.each([1, 2])(
    'draws the live kinds of planet %i within 4 sigma of an equal split, over the named seeds',
    (planetIndex) => {
      const draws = NAMED_SEEDS.flatMap((seed) =>
        patchDrawsOf(freshPlanetParamsFor(seed, planetIndex)),
      )
      const params = freshPlanetParamsFor(FIRST_SEED, planetIndex)
      for (const group of drawGroupsOf(draws)) {
        const [{ band, lead, family }] = group
        const content = { family: family as ResourceFamily, tierOffset: band - 1 + lead }
        const live = liveRosterIndicesOf(params, band, content)
        const share = 1 / live.length
        const sigma = Math.sqrt(group.length * share * (1 - share))
        for (const index of live) {
          const drawn = group.filter((draw) => draw.kindSlot === index + 1).length
          expect(Math.abs(drawn - group.length * share)).toBeLessThanOrEqual(
            SIGMA_TOLERANCE * sigma,
          )
        }
      }
    },
    PLANET_TIMEOUT_MS,
  )

  it.each([1, 2])(
    'holds every kind of planet %i within its planet bound: 4000 bp of ore value for a common, 1500 for any other',
    (planetIndex) => {
      for (const seed of NAMED_SEEDS) {
        const over = planetKindSharesBpOf(censusOf(freshPlanetParamsFor(seed, planetIndex))).filter(
          ({ isCommon, shareBp }) => shareBp > (isCommon ? COMMON_PLANET_BOUND_BP : RARE_BOUND_BP),
        )
        expect(over).toEqual([])
      }
    },
    PLANET_TIMEOUT_MS,
  )

  it('prices and gates a kinded cell exactly as the same cell without its kind', () => {
    const params = freshPlanetParamsFor(FIRST_SEED, 1)
    const kinded = centreColumnOreOf(params).filter(({ cell }) => kindSlotOfCell(cell) > 0)
    expect(kinded.length).toBeGreaterThan(0)
    const differing = kinded.filter(({ cell, tile }) => {
      const bare = withoutKindSlot(cell)
      const ore = oreTypeOf({ tier: resourceTierOf(params, cell), cellFamily: familyOfCell(cell) })
      const bareOre = oreTypeOf({
        tier: resourceTierOf(params, bare),
        cellFamily: familyOfCell(bare),
      })
      return (
        ore.id !== bareOre.id || cellGateOf(params, tile, ore) !== cellGateOf(params, tile, bareOre)
      )
    })
    expect(differing).toEqual([])
  })

  it('raises the same events with the fold on and off: no unlock, first find or artefact from a kind', () => {
    const script = GOLDEN_SCRIPTS.find((entry) => entry.name === 'mined-order-mixed')
    if (script === undefined) throw new Error('no mined-order-mixed golden script')
    const replayOf = () =>
      replayRun(script.worldSeed, stampScript(script), { endTick: script.endTick }).events.filter(
        (event) => !event.type.includes('Digest'),
      )
    expect(replayOf()).toEqual(withRosterOff(replayOf))
  })

  it('reloads a saved planet to the same roster and the same cells', () => {
    const state = createAuthorityState({
      planetIndex: 2,
      planetSeed: FIRST_SEED,
      playerIds: ['p1'],
    })
    const reading = readSaveSlot(JSON.parse(JSON.stringify(saveSlotOf(takeSnapshot(state), 1))))
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    const before = planetParamsOf(state.planet) as PlanetParams
    const after = planetParamsOf(reading.state.planet) as PlanetParams
    expect(planetRosterOf(after)).toEqual(planetRosterOf(before))
    expect(Array.from(generateChunkCells(after, 0, 4))).toEqual(
      Array.from(generateChunkCells(before, 0, 4)),
    )
  })
})
