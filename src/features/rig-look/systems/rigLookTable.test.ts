import { describe, expect, it } from 'vitest'
import { UPGRADE_IDS } from '../../../systems/economy/economyDefinition'
import { bandEvery, FIXTURE_FINISHES } from './render/rigLookFixtures'
import type { RigLookFinish, TrackLookRows } from './render/rigLookIndex'
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
    { from: 5, part: null, card: 'Single piston', colour: '#d9a066', glows: [0.3] },
    { from: 10, part: null, card: 'Triple flywheel', colour: '#ff8c42', glows: [0.5] },
  ],
  band: bandEvery(5, 3, 10),
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

const GLINT: RigLookTable['glint'] = { ticks: 24, colour: '#fff2c8', glow: 0.25 }

function tableWith(...tracks: TrackLookRows[]): RigLookTable {
  return {
    glowCaps: { drillNose: 3, rigBody: 1 },
    lookAssets: LOOK_ASSETS,
    finishes: FIXTURE_FINISHES,
    glint: GLINT,
    tracks,
  }
}

function problemsOf(rows: Partial<TrackLookRows>, ...others: TrackLookRows[]): string[] {
  return rigLookTableProblemsOf(tableWith({ ...GOOD_TRACK, ...rows }, ...others), UPGRADE_IDS)
}

function bandProblemsOf(band: Partial<TrackLookRows['band']>): string[] {
  return problemsOf({ band: { ...GOOD_TRACK.band, ...band } })
}

function finishProblemsOf(finish: Partial<RigLookFinish>): string[] {
  const finishes = {
    ...FIXTURE_FINISHES,
    'spec-brass': { ...FIXTURE_FINISHES['spec-brass'], ...finish },
  }
  return rigLookTableProblemsOf({ ...tableWith(GOOD_TRACK), finishes }, UPGRADE_IDS)
}

/** Each shipped track's band block, by track. */
const bandOf = (track: string) => RIG_LOOK_TABLE.tracks.find((rows) => rows.track === track)!.band

describe('rig look table', () => {
  it('loads the shipped table with no problem', () => {
    expect(rigLookTableProblemsOf(RIG_LOOK_TABLE, UPGRADE_IDS)).toEqual([])
  })

  it("keeps #554's drill_power looks in order, re-keyed onto the bands of 6 (ticket 809)", () => {
    expect(fromsOf('drill_power')).toEqual([6, 12, 18, 24, 30, 36, 42, 48, 54])
  })

  it('puts every authored step on its band edge, the art kept in order', () => {
    expect(fromsOf('drill_tip')).toEqual(bandOf('drill_tip').edges)
    expect(fromsOf('drill_tip')).toHaveLength(20)
    expect(fromsOf('cargo_hold')).toEqual(bandOf('cargo_hold').edges)
    expect(fromsOf('cargo_hold')).toHaveLength(21)
    expect(fromsOf('engine')).toEqual(bandOf('engine').edges)
    expect(fromsOf('engine')).toHaveLength(20)
    expect(fromsOf('boiler')).toEqual([5, 10, 15, 20, 25, 30])
    expect(fromsOf('hull')).toEqual(bandOf('hull').edges)
    expect(fromsOf('hull')).toHaveLength(19)
  })

  it("freezes each line's step from its decade and the bot's two-planet buys (VS rule)", () => {
    const shown = Object.fromEntries(
      RIG_LOOK_TABLE.tracks.map(({ track, band }) => [
        track,
        [band.decadeStep, band.twoPlanetBuys, band.step],
      ]),
    )
    expect(shown).toEqual({
      drill_power: [11, 6, 6],
      drill_tip: [110, 60, 60],
      engine: [48, 5, 5],
      boiler: [25, 5, 5],
      cargo_hold: [25, 11, 11],
      hull: [210, 120, 120],
    })
  })

  it('authors the edges to about P40 on the median path', () => {
    const lastEdges = RIG_LOOK_TABLE.tracks.map(({ track, band }) => [track, band.edges.at(-1)])
    expect(Object.fromEntries(lastEdges)).toEqual({
      drill_power: 126,
      drill_tip: 1200,
      engine: 100,
      boiler: 115,
      cargo_hold: 231,
      hull: 2280,
    })
    expect(bandOf('hull').edges).toHaveLength(19)
    expect(bandOf('boiler').edges).toHaveLength(23)
  })

  it('names each step as Progression listed them', () => {
    expect(cardsOf('drill_tip')).toEqual([
      'Steel cone',
      'Fluted bit',
      'Toothed crown',
      'Gem-set crown',
      'Aether-cut crown',
      'Carbide collar',
      'Steel ferrule',
      'Knurled bands',
      'Reamer ring',
      'Chrome face',
      'Brass bosses',
      'Coolant lines',
      'Diamond inlays',
      'Spin halo',
      'Blur collars',
      'Spin streaks',
      'Double halo',
      'Blur fan',
      'Vortex core',
      'Aether vortex',
    ])
    expect(cardsOf('engine')).toEqual([
      'Single piston',
      'Triple flywheel',
      'Guild turbine',
      'Drive flywheel',
      'Twin exhaust stacks',
      'Drive sprocket',
      'Idler wheels',
      'Coupling rods',
      'Belt guards',
      'Spinning governor',
      'Twin cylinders',
      'Steam lines',
      'Side lockers',
      'Running lamps',
      'Bull gear',
      'Belt studs',
      'Induction coils',
      'Aether hubs',
      'Wheel halos',
      'Aether drive',
    ])
    expect(cardsOf('cargo_hold')).toEqual([
      'Plank crate',
      'Ore hopper',
      'Riveted bin',
      'Side racks',
      'Strapped panniers',
      'Cargo nets',
      'Oiled tarp',
      'Lock bar',
      'Brass bumper',
      'Cargo lantern',
      'Lid clamps',
      'Lock plate',
      'Load gauge',
      'Lid handrail',
      'Pannier plates',
      'Copper lines',
      'Hoist tackle',
      'Aether seals',
      'Stasis field',
      'Aether halos',
      'Aether hold',
    ])
    expect(cardsOf('boiler')).toEqual([
      'Twin-drum boiler',
      'Pressure gauge',
      'Valve and whistle',
      'Pipe manifold',
      'Steam drum',
      'Firebox door',
    ])
    expect(cardsOf('hull')).toEqual([
      'Riveted plate',
      'Banded iron',
      'Brass-trimmed armour',
      'Layered armour',
      'Filigree armour',
      'Keel strake',
      'Stern plate',
      'Bow plate',
      'Corner plates',
      'Hatch ring',
      'Keel rivets',
      'Cap rivets',
      'Corner rivets',
      'Hatch bolts',
      'Skirt rail',
      'Stern skirt',
      'Bow skirt',
      'Full skirt',
      'Skirt bosses',
    ])
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

  it("refuses the bore gun's point, where the bought Armoury modules ride (ticket 589)", () => {
    expect(problemsOf({ slot: 'hull.front' })).toEqual([
      'engine: slot hull.front is a module or wagon point',
    ])
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
      'engine: band: step from 0 is not on its edge',
    ])
    expect(problemsOf({ steps: [first, { ...second, from: 2 }] })).toEqual([
      'engine: step from 2: from does not rise',
      'engine: band: step from 2 is not on its edge',
    ])
    expect(problemsOf({ steps: [first, { ...second, colour: first.colour }] })).toEqual([
      'engine: step from 10: repeats the step before',
    ])
  })

  it('refuses a step that breaks the VS rule, or edges under 2 apart', () => {
    expect(bandProblemsOf({ step: 4 })).toContain('engine: band: step 4 breaks the rule')
    expect(bandProblemsOf({ decadeStep: 1, twoPlanetBuys: 1, step: 1, edges: [1, 2] })).toContain(
      'engine: band: step 1 puts edges under 2 apart',
    )
  })

  it('refuses edges that are not the multiples of the step', () => {
    expect(bandProblemsOf({ edges: [5, 10, 16] })).toEqual([
      'engine: band: edges are not the steps',
    ])
  })

  it('refuses an authored step off its edge, or more steps than edges', () => {
    const [first, second] = GOOD_TRACK.steps
    expect(problemsOf({ steps: [first, { ...second, from: 11 }] })).toEqual([
      'engine: band: step from 11 is not on its edge',
    ])
    expect(bandProblemsOf({ edges: [5] })).toEqual([
      'engine: band: has more steps than edges',
      'engine: band: step from 10 is not on its edge',
    ])
  })

  it('refuses a finish cycle too short to keep finish and pips apart, or unknown finishes', () => {
    expect(bandProblemsOf({ decadeStep: 48, twoPlanetBuys: 5 })).toEqual([
      'engine: finishes: has 2 finishes, not 10 to 12',
    ])
    expect(bandProblemsOf({ finishes: ['spec-brass', 'spec-gone'] })).toEqual([
      'engine: finishes: spec-gone is not a finish',
    ])
  })

  it('refuses neighbours alike in the finish cycle, the wrap from last to first included', () => {
    expect(bandProblemsOf({ finishes: ['spec-brass', 'spec-steel', 'spec-brass'] })).toEqual([
      'engine: finishes: repeats a neighbour',
    ])
  })

  it('refuses a finish cycle that starts on the top step, so the first finish band shows', () => {
    const [first, second] = GOOD_TRACK.steps
    const top = { ...second, colour: FIXTURE_FINISHES['spec-brass'].colour }
    expect(problemsOf({ steps: [first, top] })).toEqual([
      'engine: finishes: starts on the top step',
    ])
  })

  it('refuses a finish named in more than 3 words, or not a material', () => {
    expect(finishProblemsOf({ name: 'Very bright brass plate' })).toEqual([
      'finish spec-brass: name Very bright brass plate is not 1 to 3 words',
    ])
    expect(finishProblemsOf({ colour: 'brass', metalness: 2, roughness: -1 })).toEqual([
      'finish spec-brass: colour brass is not #rrggbb',
      'finish spec-brass: metalness is not 0 to 1',
      'finish spec-brass: roughness is not 0 to 1',
    ])
  })

  it('refuses a step card of more than 3 words, the hover line’s band name', () => {
    const [first, second] = GOOD_TRACK.steps
    expect(problemsOf({ steps: [{ ...first, card: 'A very long piston' }, second] })).toEqual([
      'engine: step from 5: card A very long piston is long',
    ])
  })

  it("refuses a glint that reaches its track's cap over the brightest look", () => {
    const [first, second] = GOOD_TRACK.steps
    expect(problemsOf({ steps: [first, { ...second, glows: [0.8] }] })).toEqual([
      'engine: glint reaches its cap',
    ])
  })

  it('refuses glows that reach their cap, summed over every track lighting the part', () => {
    const [first, second] = GOOD_TRACK.steps
    expect(problemsOf({ steps: [first, { ...second, glows: [1] }] })).toEqual([
      'engine: glint reaches its cap',
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
      'vehicle-look-boiler': [
        'firebox-boiler',
        'gauged-boiler',
        'kettle-boiler',
        'manifold-boiler',
        'steam-drum-boiler',
        'twin-drum-boiler',
        'whistle-boiler',
      ],
      'vehicle-look-cargo-hold': [
        'aether-bin',
        'barred-bin',
        'bumpered-bin',
        'clamped-bin',
        'field-bin',
        'gauged-bin',
        'haloed-bin',
        'hoisted-bin',
        'lamped-bin',
        'locked-bin',
        'netted-bin',
        'ore-hatch',
        'ore-hopper',
        'pannier-bin',
        'piped-bin',
        'plank-crate',
        'plated-bin',
        'racked-bin',
        'railed-bin',
        'riveted-bin',
        'sealed-bin',
        'tarped-bin',
      ],
      'vehicle-look-drill-tip': [
        'aether-cut-crown',
        'aether-vortex-crown',
        'blur-collar-crown',
        'bossed-crown',
        'chromed-crown',
        'collared-crown',
        'cooled-crown',
        'cutter-crown',
        'double-halo-crown',
        'fanned-crown',
        'ferruled-crown',
        'fluted-bit',
        'gem-set-crown',
        'haloed-crown',
        'inlaid-crown',
        'knurled-crown',
        'reamed-crown',
        'steel-cone',
        'streaked-crown',
        'toothed-crown',
        'vortex-crown',
      ],
      'vehicle-look-drive': [
        'aether-hub-track',
        'aether-track',
        'bare-hub',
        'coiled-track',
        'coupled-track',
        'cylinder-track',
        'exhaust-track',
        'flywheel-track',
        'geared-track',
        'governor-track',
        'guard-track',
        'guild-track',
        'haloed-track',
        'idler-track',
        'iron-track',
        'lamped-track',
        'locker-track',
        'piped-track',
        'sprocket-track',
        'steel-track',
        'studded-track',
      ],
      'vehicle-look-hull': [
        'banded-iron',
        'bossed-skirt-armour',
        'bow-plated-armour',
        'bow-skirt-armour',
        'brass-trimmed-armour',
        'bronze-pod',
        'cap-riveted-armour',
        'corner-plated-armour',
        'corner-riveted-armour',
        'filigree-armour',
        'full-skirt-armour',
        'hatch-bolted-armour',
        'hatch-ringed-armour',
        'keel-riveted-armour',
        'keel-strake-armour',
        'layered-armour',
        'riveted-plate',
        'skirt-rail-armour',
        'stern-plated-armour',
        'stern-skirt-armour',
      ],
    })
  })

  it('loads steps cut from a look asset, standing in a vehicle part slot', () => {
    expect(problemsOf(LOOK_TRACK)).toEqual([])
    expect(problemsOf({ ...LOOK_TRACK, replaces: undefined })).toEqual([])
  })

  it('refuses an asset that is not one of the look assets', () => {
    expect(lookStepProblemsOf({ asset: 'vehicle-look-gone' })).toEqual([
      'engine: step from 5: asset vehicle-look-gone is not a look asset',
    ])
  })

  it('refuses a part its look asset does not have', () => {
    expect(lookStepProblemsOf({ part: 'kettle-drum' })).toEqual([
      'engine: step from 5: part kettle-drum is not a part of vehicle-look-boiler',
    ])
  })

  it('refuses a vehicle step whose part is not a vehicle part, and an asset with no part', () => {
    expect(lookStepProblemsOf({ asset: undefined })).toEqual([
      'engine: step from 5: part twin-drum-boiler is not a vehicle part',
    ])
    expect(lookStepProblemsOf({ asset: undefined, part: 't3-drill-bit' })).toEqual([])
    expect(lookStepProblemsOf({ part: null })).toEqual([
      'engine: step from 5: names vehicle-look-boiler but no part',
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
