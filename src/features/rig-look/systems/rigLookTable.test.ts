import { describe, expect, it } from 'vitest'
import { UPGRADE_IDS } from '../../../systems/economy/economyDefinition'
import type { TrackLookRows } from './render/rigLookIndex'
import { RIG_LOOK_TABLE, readRigLookTable, RigLookTableError } from './rigLookTable'
import {
  MODULE_ATTACH_POINTS,
  rigLookTableProblemsOf,
  type RigLookTable,
} from './rigLookTableChecks'

const fromsOf = (track: string) =>
  RIG_LOOK_TABLE.tracks.find((rows) => rows.track === track)?.steps.map((step) => step.from)

const cardsOf = (track: string) =>
  RIG_LOOK_TABLE.tracks.find((rows) => rows.track === track)?.steps.map((step) => step.card)

const GOOD_TRACK: TrackLookRows = {
  track: 'engine',
  slot: 'chassis.drive',
  glowSlots: [['piston']],
  glowCap: 'rigBody',
  steps: [
    { from: 2, part: null, card: 'Single piston', colour: '#d9a066', glows: [0.3] },
    { from: 18, part: null, card: 'Triple flywheel', colour: '#ff8c42', glows: [0.5] },
  ],
  tail: {
    delta: 1,
    palette: ['#ffd27a', '#8fffb0'],
    plating: ['bright', 'blued'],
    glow: [[0.6], [0.8]],
  },
}

const LOOK_ASSETS: RigLookTable['lookAssets'] = {
  'vehicle-look-boiler': ['kettle-boiler', 'twin-drum-boiler'],
}

/** GOOD_TRACK's steps cut from the boiler look asset, standing in the piston's slot. */
const LOOK_TRACK: Partial<TrackLookRows> = {
  replaces: 'piston',
  steps: GOOD_TRACK.steps.map((step) => ({
    ...step,
    asset: 'vehicle-look-boiler',
    part: 'twin-drum-boiler',
  })),
}

function lookStepProblemsOf(step: Partial<TrackLookRows['steps'][number]>): string[] {
  const [first, second] = LOOK_TRACK.steps!
  return problemsOf({ ...LOOK_TRACK, steps: [{ ...first, ...step }, second] })
}

function tableWith(...tracks: TrackLookRows[]): RigLookTable {
  return { glowCaps: { drillNose: 3, rigBody: 1 }, lookAssets: LOOK_ASSETS, tracks }
}

function problemsOf(rows: Partial<TrackLookRows>, ...others: TrackLookRows[]): string[] {
  return rigLookTableProblemsOf(tableWith({ ...GOOD_TRACK, ...rows }, ...others), UPGRADE_IDS)
}

function tailProblemsOf(tail: Partial<TrackLookRows['tail']>): string[] {
  return problemsOf({ tail: { ...GOOD_TRACK.tail, ...tail } })
}

describe('rig look table', () => {
  it('loads the shipped table with no problem', () => {
    expect(rigLookTableProblemsOf(RIG_LOOK_TABLE, UPGRADE_IDS)).toEqual([])
  })

  it("keeps #554's drill_power thresholds unchanged", () => {
    expect(fromsOf('drill_power')).toEqual([5, 10, 15, 20, 30, 40, 50, 75, 100])
  })

  it("takes the other tracks' thresholds from Systems' table, hull counted in levels.hull", () => {
    expect(fromsOf('drill_tip')).toEqual([70, 100, 130, 190, 280])
    expect(fromsOf('cargo_hold')).toEqual([23, 31, 33])
    expect(fromsOf('engine')).toEqual([2, 18, 26])
    expect(fromsOf('boiler')).toEqual([16])
    expect(fromsOf('hull')).toEqual([20, 80, 140, 260, 440])
  })

  it('names each step as Progression listed them', () => {
    expect(cardsOf('drill_tip')).toEqual([
      'Steel cone',
      'Fluted bit',
      'Toothed crown',
      'Gem-set crown',
      'Aether-cut crown',
    ])
    expect(cardsOf('engine')).toEqual(['Single piston', 'Triple flywheel', 'Guild turbine'])
    expect(cardsOf('cargo_hold')).toEqual(['Plank crate', 'Ore hopper', 'Riveted bin'])
    expect(cardsOf('boiler')).toEqual(['Twin-drum boiler'])
  })

  it('has every upgrade track but combat, which waits for its own row block (#588)', () => {
    expect(RIG_LOOK_TABLE.tracks.map((rows) => rows.track).sort()).toEqual([...UPGRADE_IDS].sort())
    expect(fromsOf('combat')).toBeUndefined()
  })

  it('refuses a track that is not an upgrade track, unless the caller knows it', () => {
    expect(problemsOf({ track: 'combat' })).toEqual(['combat: not an upgrade track'])
    const table = tableWith({ ...GOOD_TRACK, track: 'combat' })
    expect(rigLookTableProblemsOf(table, [...UPGRADE_IDS, 'combat'])).toEqual([])
  })

  it('refuses two row blocks for one track', () => {
    expect(problemsOf({}, { ...GOOD_TRACK, slot: 'hull.cargo' })).toContain(
      'engine: has more than one row block',
    )
  })

  it('refuses every module and wagon point as a slot', () => {
    for (const slot of MODULE_ATTACH_POINTS) {
      expect(problemsOf({ slot })).toEqual([`engine: slot ${slot} is a module or wagon point`])
    }
    expect(MODULE_ATTACH_POINTS).toEqual(
      expect.arrayContaining([
        'hull.nose',
        'hull.roof.coils',
        'hull.tail',
        'hull.flank',
        'hull.stack.side',
      ]),
    )
  })

  it("refuses a slot that is not an attach point, or another track's", () => {
    expect(problemsOf({ slot: 'hull.keel' })).toEqual([
      'engine: slot hull.keel is not a vehicle-attach point',
    ])
    expect(problemsOf({}, { ...GOOD_TRACK, track: 'boiler', glowSlots: [['boiler']] })).toEqual([
      "boiler: slot chassis.drive is another track's",
    ])
  })

  it('refuses a step before the first purchase, a step that does not rise, and a repeated look', () => {
    const [first, second] = GOOD_TRACK.steps
    expect(problemsOf({ steps: [{ ...first, from: 0 }, second] })).toEqual([
      'engine: step from 0: from is not a count from 1',
    ])
    expect(problemsOf({ steps: [first, { ...second, from: 2 }] })).toEqual([
      'engine: step from 2: from does not rise',
    ])
    expect(problemsOf({ steps: [first, { ...second, colour: first.colour }] })).toEqual([
      'engine: step from 18: repeats the step before',
    ])
  })

  it('refuses a ladder of fewer than 2 or more than 8 entries', () => {
    expect(tailProblemsOf({ palette: ['#000001'] })).toEqual([
      'engine: tail: palette has 1 entries, not 2 to 8',
    ])
    expect(tailProblemsOf({ plating: 'abcdefghi'.split('') })).toEqual([
      'engine: tail: plating has 9 entries, not 2 to 8',
    ])
  })

  it('refuses neighbours alike in a ladder, the wrap from last to first included', () => {
    expect(tailProblemsOf({ palette: ['#000001', '#000002', '#000001'] })).toEqual([
      'engine: tail: palette repeats a neighbour',
    ])
    expect(tailProblemsOf({ plating: ['a', 'a', 'b'] })).toEqual([
      'engine: tail: plating repeats a neighbour',
    ])
    expect(tailProblemsOf({ glow: [[0.5], [0.6], [0.5]] })).toEqual([
      'engine: tail: glow repeats a neighbour',
    ])
  })

  it('refuses a palette that starts on the top step, so the first tail purchase shows', () => {
    expect(tailProblemsOf({ palette: ['#ff8c42', '#000001'] })).toEqual([
      'engine: tail: palette starts on the top step',
    ])
  })

  it('refuses a delta that is not a whole count from 1', () => {
    expect(tailProblemsOf({ delta: 0 })).toEqual(['engine: tail: delta is not a count from 1'])
  })

  it('refuses glows that reach their cap, summed over every track lighting the part', () => {
    expect(tailProblemsOf({ glow: [[0.6], [1]] })).toEqual([
      'part slot piston: glows reach the rigBody cap',
    ])
    const sharing = { ...GOOD_TRACK, track: 'boiler', slot: 'hull.boiler' }
    expect(problemsOf({}, sharing)).toEqual(['part slot piston: glows reach the rigBody cap'])
  })

  it('throws with every problem listed when a bad table loads', () => {
    const table = tableWith({ ...GOOD_TRACK, track: 'combat', slot: 'hull.nose' })
    expect(() => readRigLookTable(table)).toThrow(RigLookTableError)
    expect(() => readRigLookTable(table)).toThrow(
      'rigLook.json: combat: not an upgrade track; combat: slot hull.nose is a module or wagon point',
    )
  })

  it('names each shipped look asset with the parts its Blender file has', () => {
    expect(RIG_LOOK_TABLE.lookAssets).toEqual({
      'vehicle-look-boiler': ['kettle-boiler', 'twin-drum-boiler'],
      'vehicle-look-hull': [
        'banded-iron',
        'brass-trimmed-armour',
        'bronze-pod',
        'filigree-armour',
        'layered-armour',
        'riveted-plate',
      ],
    })
  })

  it('loads steps cut from a look asset, standing in a vehicle part slot', () => {
    expect(problemsOf(LOOK_TRACK)).toEqual([])
    expect(problemsOf({ ...LOOK_TRACK, replaces: undefined })).toEqual([])
  })

  it('refuses an asset that is not one of the look assets', () => {
    expect(lookStepProblemsOf({ asset: 'vehicle-look-gone' })).toEqual([
      'engine: step from 2: asset vehicle-look-gone is not a look asset',
    ])
  })

  it('refuses a part its look asset does not have', () => {
    expect(lookStepProblemsOf({ part: 'kettle-drum' })).toEqual([
      'engine: step from 2: part kettle-drum is not a part of vehicle-look-boiler',
    ])
  })

  it('refuses a vehicle step whose part is not a vehicle part, and an asset with no part', () => {
    expect(lookStepProblemsOf({ asset: undefined })).toEqual([
      'engine: step from 2: part twin-drum-boiler is not a vehicle part',
    ])
    expect(lookStepProblemsOf({ asset: undefined, part: 't3-drill-bit' })).toEqual([])
    expect(lookStepProblemsOf({ part: null })).toEqual([
      'engine: step from 2: names vehicle-look-boiler but no part',
    ])
  })

  it('refuses a look part on any module, wagon or aetheric point', () => {
    for (const slot of MODULE_ATTACH_POINTS) {
      expect(problemsOf({ ...LOOK_TRACK, slot })).toEqual([
        `engine: slot ${slot} is a module or wagon point`,
      ])
    }
  })

  it('refuses a hidden slot that is not a vehicle part slot, or one another track hides', () => {
    expect(problemsOf({ ...LOOK_TRACK, replaces: 'keel' })).toEqual([
      'engine: replaces keel, which is not a vehicle part slot',
    ])
    const boiler = {
      ...GOOD_TRACK,
      track: 'boiler',
      slot: 'hull.boiler',
      glowSlots: [['boiler']],
      replaces: 'piston',
    }
    expect(problemsOf(LOOK_TRACK, boiler)).toEqual(["boiler: replaces piston, another track's"])
  })

  it('refuses a look asset outside the vehicle category, with no part or a repeated one', () => {
    const table = {
      ...tableWith(GOOD_TRACK),
      lookAssets: {
        'prop-look': ['a'],
        'vehicle-look-empty': [],
        'vehicle-look-twice': ['a', 'a'],
      },
    }
    expect(rigLookTableProblemsOf(table, UPGRADE_IDS)).toEqual([
      'look asset prop-look: is not a vehicle- asset',
      'look asset vehicle-look-empty: has no part',
      'look asset vehicle-look-twice: repeats a part',
    ])
  })
})
