import { describe, expect, it } from 'vitest'
import { attachCoverageProblems, type AttachedItem } from './attachCoverage'
import { ATTACH_IDS, attachOf, type AttachId } from './vehicleAttach'
import type { LoadoutSlotId } from './vehicleLoadout'

const POWER_UP_SLOTS: readonly LoadoutSlotId[] = [
  'powerup.1',
  'powerup.2',
  'powerup.3',
  'powerup.4',
  'powerup.5',
]

const extractor = (id: string, attach: AttachedItem['attach']): AttachedItem => ({
  id,
  slots: [],
  attach,
})
const powerUp = (id: string, attach: AttachedItem['attach']): AttachedItem => ({
  id,
  slots: POWER_UP_SLOTS,
  attach,
})
// Each drill slot draws at the point of the same name (#162 sockets table).
const drillGear = (id: string, slot: LoadoutSlotId & AttachId): AttachedItem => ({
  id,
  slots: [slot],
  attach: slot,
})

// The physical rows of the #162 catalogue after the TD socket amendments: every extractor owned
// (always equipped), every power-up, consumable and drill gear item that can be equipped.
const CATALOGUE: readonly AttachedItem[] = [
  extractor('rig.resonance', 'drill.fork'),
  extractor('rig.containment', 'drill.hood'),
  extractor('rig.acid_etcher', 'hull.arm.left'),
  extractor('rig.induction', 'hull.front'),
  extractor('rig.aether_tether', 'hull.roof.mid'),
  extractor('passive.threat_periscope', 'hull.roof.fore'),
  extractor('passive.assay_lens', 'cab.gauge'),
  extractor('passive.hazard_barometer', 'cab.gauge'),
  drillGear('gear.vibratory_bit', 'drill.head'),
  drillGear('gear.twin_bit', 'drill.head'),
  drillGear('gear.thaw_crown', 'drill.head'),
  drillGear('gear.dielectric_bit', 'drill.head'),
  drillGear('gear.side_cutters', 'drill.flank'),
  drillGear('gear.spoil_auger', 'drill.collar'),
  drillGear('gear.sampling_corer', 'drill.collar'),
  drillGear('gear.reach_boom', 'drill.collar'),
  powerUp('power.echo_sounder', 'hull.roof.aft'),
  powerUp('power.grapple_winch', 'hull.arm.right'),
  powerUp('consumable.flare_mortar', 'hull.rear'),
  powerUp('consumable.stabiliser_foam', 'hull.rear'),
  powerUp('consumable.escape_thruster', 'hull.rear'),
  powerUp('power.mineral_drain', 'slot'),
  powerUp('power.ore_shifter', 'slot'),
  powerUp('power.steam_shield', 'slot'),
  powerUp('power.grav_anchor', 'slot'),
]

// The five aetheric power-ups on their own points (TD lock on #265, ticket 376), as #265 registers
// them: each can be slotted with any other power-up, so each point has one owner.
const AETHERIC: readonly AttachedItem[] = [
  powerUp('power.resonance_whistle', 'hull.stack.side'),
  powerUp('power.phase_lantern', 'hull.nose'),
  powerUp('power.arc_coil', 'hull.roof.coils'),
  powerUp('power.chronometric_governor', 'hull.tail'),
  powerUp('power.aether_condenser', 'hull.flank'),
]

// Where the five parts would have gone without their own points (#265 pause): two showcase points
// the vehicle holds, and the points of the tether (always mounted) and the echo sounder.
const NEIGHBOUR_POINTS: readonly AttachId[] = [
  'hull.stack',
  'hull.liner',
  'hull.roof.mid',
  'hull.roof.aft',
]

function catalogueWith(id: string, change: Partial<AttachedItem>): AttachedItem[] {
  return CATALOGUE.map((item) => (item.id === id ? { ...item, ...change } : item))
}

/** The catalogue with the five aetheric parts on their own points. */
function catalogueWithAetheric(): AttachedItem[] {
  return [...CATALOGUE, ...AETHERIC]
}

function aethericWith(id: string, attach: AttachId): AttachedItem[] {
  return catalogueWithAetheric().map((item) => (item.id === id ? { ...item, attach } : item))
}

function ownersOf(items: readonly AttachedItem[], point: AttachId): string[] {
  return items.filter((item) => item.attach === point).map((item) => item.id)
}

describe('attach coverage', () => {
  it('finds no shared point with every extractor owned and every gear item equipped', () => {
    expect(attachCoverageProblems(CATALOGUE, ATTACH_IDS)).toEqual([])
  })

  it('fails when the resonance fork moves onto the drill collar', () => {
    const problems = attachCoverageProblems(
      catalogueWith('rig.resonance', { attach: 'drill.collar' }),
      ATTACH_IDS,
    )
    expect(problems).toContain(
      'items "rig.resonance" and "gear.spoil_auger" can be on the vehicle together but share "drill.collar"',
    )
  })

  it('fails when two power-ups that can be slotted together share a named point', () => {
    const problems = attachCoverageProblems(
      catalogueWith('consumable.flare_mortar', { attach: 'hull.roof.aft' }),
      ATTACH_IDS,
    )
    expect(problems).toEqual([
      'items "power.echo_sounder" and "consumable.flare_mortar" can be on the vehicle together but share "hull.roof.aft"',
    ])
  })

  it('lets items of one single slot share its point', () => {
    const heads = CATALOGUE.filter((item) => item.attach === 'drill.head')
    expect(heads).toHaveLength(4)
    expect(attachCoverageProblems(heads, ATTACH_IDS)).toEqual([])
  })

  it('fails when an item names an attach id the sidecar lacks', () => {
    const sidecarIds = ATTACH_IDS.filter((id) => id !== 'drill.fork')
    expect(attachCoverageProblems(CATALOGUE, sidecarIds)).toEqual([
      'item "rig.resonance" names "drill.fork", which the sidecar lacks',
    ])
  })

  it('fails when an item names a string that is no attach id', () => {
    const stray = { id: 'gear.stray', slots: [], attach: 'hull.keel' } as unknown as AttachedItem
    expect(attachCoverageProblems([stray], ATTACH_IDS)).toEqual([
      'item "gear.stray" names "hull.keel", which is not an attach id',
    ])
  })

  it('accepts "slot" only from an item that goes in powerup slots alone', () => {
    const problems = attachCoverageProblems(
      [
        drillGear('gear.bit', 'drill.head'),
        { id: 'gear.slotted', slots: ['drill.head'], attach: 'slot' },
      ],
      ATTACH_IDS,
    )
    expect(problems).toEqual([
      'item "gear.slotted" declares attach "slot" but goes in a non-powerup slot',
    ])
  })

  it('keeps items off the points the vehicle itself holds and the slot points', () => {
    const problems = attachCoverageProblems(
      [extractor('rig.housing', 'drill.housing'), powerUp('power.boxed', 'hull.powerup.3')],
      ATTACH_IDS,
    )
    expect(problems).toEqual([
      'item "rig.housing" names "drill.housing", which the vehicle holds',
      'item "power.boxed" names "hull.powerup.3"; slot points are taken through "slot"',
    ])
  })

  it('ignores items with no physical part', () => {
    expect(attachCoverageProblems([extractor('passive.ledger', null)], [])).toEqual([])
  })
})

describe('attach coverage: the five aetheric points (ticket 376)', () => {
  it('finds no problem with the five aetheric parts on their points beside the whole catalogue', () => {
    expect(attachCoverageProblems(catalogueWithAetheric(), ATTACH_IDS)).toEqual([])
  })

  it('gives each aetheric point exactly one owner', () => {
    const items = catalogueWithAetheric()
    expect(AETHERIC.map((item) => ownersOf(items, item.attach as AttachId))).toEqual(
      AETHERIC.map((item) => [item.id]),
    )
  })

  it.each(AETHERIC.flatMap((item) => NEIGHBOUR_POINTS.map((point) => [item.id, point])))(
    'fails when %s moves onto %s',
    (id, point) => {
      expect(attachCoverageProblems(aethericWith(id, point as AttachId), ATTACH_IDS)).not.toEqual(
        [],
      )
    },
  )

  it('names the held point or the item it would clash with', () => {
    const lantern = 'power.phase_lantern'
    expect(attachCoverageProblems(aethericWith(lantern, 'hull.stack'), ATTACH_IDS)).toEqual([
      'item "power.phase_lantern" names "hull.stack", which the vehicle holds',
    ])
    expect(attachCoverageProblems(aethericWith(lantern, 'hull.liner'), ATTACH_IDS)).toEqual([
      'item "power.phase_lantern" names "hull.liner", which the vehicle holds',
    ])
    expect(attachCoverageProblems(aethericWith(lantern, 'hull.roof.mid'), ATTACH_IDS)).toEqual([
      'items "rig.aether_tether" and "power.phase_lantern" can be on the vehicle together but share "hull.roof.mid"',
    ])
    expect(attachCoverageProblems(aethericWith(lantern, 'hull.roof.aft'), ATTACH_IDS)).toEqual([
      'items "power.echo_sounder" and "power.phase_lantern" can be on the vehicle together but share "hull.roof.aft"',
    ])
  })

  it('fails when a second item that can be on the vehicle with the owner takes its point', () => {
    const items = [...catalogueWithAetheric(), powerUp('power.second_lantern', 'hull.nose')]
    expect(attachCoverageProblems(items, ATTACH_IDS)).toEqual([
      'items "power.phase_lantern" and "power.second_lantern" can be on the vehicle together but share "hull.nose"',
    ])
  })

  it('lets two items that can never be on the vehicle together share an aetheric point', () => {
    const forkSiblings = [
      { id: 'gear.lantern_left', slots: ['drill.head'], attach: 'hull.nose' },
      { id: 'gear.lantern_right', slots: ['drill.head'], attach: 'hull.nose' },
    ] satisfies AttachedItem[]
    expect(attachCoverageProblems(forkSiblings, ATTACH_IDS)).toEqual([])
  })

  it('fails when the vehicle sidecar lacks an aetheric point', () => {
    const sidecarIds = ATTACH_IDS.filter((id) => id !== 'hull.flank')
    expect(attachCoverageProblems(catalogueWithAetheric(), sidecarIds)).toEqual([
      'item "power.aether_condenser" names "hull.flank", which the sidecar lacks',
    ])
  })
})

// The tech-tree's gear rows name the five points as attach uses (ticket 265), so each item
// resolves its point on the loaded slices whether or not its own slice has shipped it yet.
describe('attach coverage: the five aetheric parts on the loaded slices (ticket 265)', () => {
  it('resolves an attach use for each of the five aetheric items at its own point', () => {
    expect(AETHERIC.map((item) => attachOf(item.id))).toEqual(AETHERIC.map((item) => item.attach))
  })
})
