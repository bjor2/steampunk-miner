import { describe, expect, it } from 'vitest'
import { UPGRADE_IDS } from '../../../systems/economy/economyDefinition'
import { LARGEST_LOOK_PURCHASES } from './render/rigLookIndex'
import { createTrackLookFrames } from './render/rigLookFrames'
import { rigLookPlaqueFactOf, SHIPPED_RIG_LOOKS, trackLookFramesOf } from './rigLooks'
import { levelTextOf, plaqueFactOf } from './rigLookPlaque'
import { RIG_LOOK_TABLE } from './rigLookTable'
import { rigLookTableProblemsOf, type RigLookTable } from './rigLookTableChecks'

/** Progression's names (#157 comment 6300549964) on each track's first band edges (ticket 809). */
const NAMED_STEPS: readonly (readonly [string, number, string])[] = [
  ['hull', 120, 'Riveted plate'],
  ['hull', 240, 'Banded iron'],
  ['hull', 360, 'Brass-trimmed armour'],
  ['hull', 480, 'Layered armour'],
  ['hull', 600, 'Filigree armour'],
  ['drill_tip', 60, 'Steel cone'],
  ['drill_tip', 120, 'Fluted bit'],
  ['drill_tip', 180, 'Toothed crown'],
  ['drill_tip', 240, 'Gem-set crown'],
  ['drill_tip', 300, 'Aether-cut crown'],
  ['cargo_hold', 11, 'Plank crate'],
  ['cargo_hold', 22, 'Ore hopper'],
  ['cargo_hold', 33, 'Riveted bin'],
  ['engine', 5, 'Single piston'],
  ['engine', 10, 'Triple flywheel'],
  ['engine', 15, 'Guild turbine'],
  ['boiler', 5, 'Twin-drum boiler'],
  ['drill_power', 6, 'Amber glow'],
  ['drill_power', 60, 'Pressure gauge'],
  ['drill_power', 126, 'Aether housing'],
]

/** The tracks whose look rows carry a plaque template: every one since LK12 (ticket 875). */
const PLAQUE_TRACKS: readonly string[] = [
  'drill_power',
  'drill_tip',
  'boiler',
  'cargo_hold',
  'hull',
  'engine',
]

/** The widest plaque fact a 360 px plaque wraps onto its own line (Content's 4-word names). */
const PHONE_FACT_CHARS_MAX = 44

const topOf = (track: string) =>
  RIG_LOOK_TABLE.tracks.find((rows) => rows.track === track)!.steps.at(-1)!.from

function tableWithHullPlaque(step: string, tail: string): RigLookTable {
  const tracks = RIG_LOOK_TABLE.tracks.map((rows) =>
    rows.track === 'hull' ? { ...rows, plaque: { step, tail } } : rows,
  )
  return { ...RIG_LOOK_TABLE, tracks }
}

describe('rig look plaque fact (tickets 585, 809)', () => {
  it('names nothing below the first hull edge, so no unowned band is named', () => {
    expect(rigLookPlaqueFactOf('hull', 0)).toBeNull()
    expect(rigLookPlaqueFactOf('hull', 119)).toBeNull()
  })

  it.each(NAMED_STEPS)('names the owned %s step from %i purchases: %s', (track, from, name) => {
    expect(rigLookPlaqueFactOf(track, from - 1)).not.toBe(`Fitting: ${name}`)
    expect(rigLookPlaqueFactOf(track, from)).toBe(`Fitting: ${name}`)
  })

  it('names the band owned, never the next one, on the last purchase before an edge', () => {
    expect(rigLookPlaqueFactOf('hull', 239)).toBe('Fitting: Riveted plate')
    expect(rigLookPlaqueFactOf('hull', 599)).toBe('Fitting: Layered armour')
  })

  it('shows no level on an authored band, then the finish and the exact level past the art', () => {
    expect(rigLookPlaqueFactOf('hull', 600)).toBe('Fitting: Filigree armour')
    expect(rigLookPlaqueFactOf('hull', 2280)).toBe('Fitting: Skirt bosses')
    expect(rigLookPlaqueFactOf('hull', 2400)).toBe('Fitting: Gunmetal · L2,400')
    expect(rigLookPlaqueFactOf('hull', 2401)).toBe('Fitting: Gunmetal · L2,401')
    expect(rigLookPlaqueFactOf('hull', 2520)).toBe('Fitting: Bright brass · L2,520')
  })

  it('shows the exact level through the #681 long mode, grouped, at any count', () => {
    expect(rigLookPlaqueFactOf('engine', 9_999)).toMatch(/ · L9,999$/)
    expect(rigLookPlaqueFactOf('engine', 1_000_000)).toMatch(/ · L1,000,000$/)
    expect(levelTextOf(LARGEST_LOOK_PURCHASES)).toBe('2,147,483,647')
    expect(levelTextOf(2 ** 40)).toBe('2,147,483,647')
  })

  it('names every finish band of a track for the finish it wears', () => {
    for (const track of PLAQUE_TRACKS) {
      const frames = SHIPPED_RIG_LOOKS.tracks.find((each) => each.rows.track === track)!
      const { step, finishes } = frames.rows.band
      finishes.forEach((id, at) => {
        const n = topOf(track) + (at + 1) * step
        expect(rigLookPlaqueFactOf(track, n)).toBe(
          `Fitting: ${RIG_LOOK_TABLE.finishes[id].name} · L${levelTextOf(n)}`,
        )
      })
    }
  })

  it('fits the widest fact of every track on a 360 px plaque, up to 2^31 - 1', () => {
    const cards = RIG_LOOK_TABLE.tracks.flatMap((rows) => rows.steps.map((step) => step.card))
    const finishes = Object.values(RIG_LOOK_TABLE.finishes).map((finish) => finish.name)
    const facts = [
      ...cards.map((card) => `Fitting: ${card}`),
      ...finishes.map((name) => `Fitting: ${name} · L${levelTextOf(LARGEST_LOOK_PURCHASES)}`),
    ]
    for (const fact of facts) expect(fact.length, fact).toBeLessThanOrEqual(PHONE_FACT_CHARS_MAX)
  })

  it('names a band on every shipped track, since each carries a plaque template', () => {
    expect(RIG_LOOK_TABLE.tracks.map((rows) => rows.track).sort()).toEqual(
      [...PLAQUE_TRACKS].sort(),
    )
    for (const track of PLAQUE_TRACKS) expect(rigLookPlaqueFactOf(track, 1_000_000)).not.toBeNull()
  })

  it('keeps a track without a plaque template off the plaque', () => {
    const frames = trackLookFramesOf(SHIPPED_RIG_LOOKS, 'hull')!
    const { plaque: _plaque, ...rows } = frames.rows
    const plain = createTrackLookFrames(rows, SHIPPED_RIG_LOOKS.finishes)
    for (const n of [0, 1, 100, 1_000, 1_000_000]) expect(plaqueFactOf(plain, n)).toBeNull()
  })
})

describe('rig look plaque template checks', () => {
  it('loads the shipped drill tip, engine, boiler, cargo hold and hull templates', () => {
    expect(rigLookTableProblemsOf(RIG_LOOK_TABLE, UPGRADE_IDS)).toEqual([])
  })

  it('refuses a step template without the band name, or one that shows the level', () => {
    const table = tableWithHullPlaque('Fitting', 'Fitting: {bandName} · L{level}')
    expect(rigLookTableProblemsOf(table, UPGRADE_IDS)).toEqual([
      'hull: plaque step needs {bandName} once',
    ])
    const levelled = tableWithHullPlaque('{bandName} {level}', 'Fitting: {bandName} · L{level}')
    expect(rigLookTableProblemsOf(levelled, UPGRADE_IDS)).toEqual([
      'hull: plaque step may not show {level}',
    ])
  })

  it('refuses a tail template without the level', () => {
    const table = tableWithHullPlaque('Fitting: {bandName}', 'Fitting: {bandName}')
    expect(rigLookTableProblemsOf(table, UPGRADE_IDS)).toEqual([
      'hull: plaque tail needs {level} once',
    ])
  })

  it('refuses a template on a track whose steps carry no card', () => {
    const tracks = RIG_LOOK_TABLE.tracks.map((rows) =>
      rows.track === 'hull'
        ? { ...rows, steps: rows.steps.map((step) => ({ ...step, card: null })) }
        : rows,
    )
    const problems = rigLookTableProblemsOf({ ...RIG_LOOK_TABLE, tracks }, UPGRADE_IDS)
    expect(problems).toContain('hull: step from 120: no card for the plaque')
  })
})
