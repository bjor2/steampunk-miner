import { describe, expect, it } from 'vitest'
import { attachCoverageProblems, type AttachedItem } from './attachCoverage'
import { ATTACH_IDS, type AttachId } from './vehicleAttach'
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

function catalogueWith(id: string, change: Partial<AttachedItem>): AttachedItem[] {
  return CATALOGUE.map((item) => (item.id === id ? { ...item, ...change } : item))
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
