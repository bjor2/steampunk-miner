import { describe, expect, it } from 'vitest'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'
import { BAY_IDS } from '../world/dockBays'
import { BARE_CATALOGUE_CATEGORIES, bareCatalogueIdProblems } from './catalogueIds'
import { artefactItemOf, bayItemOf, KERNEL_ITEMS, liningItemOf, trackItemOf } from './kernelItems'

/** Every kind the kernel's own buyables are named under (K7 #199). */
function kernelItemKinds(): Set<string> {
  const refs = [
    ...Object.values(KERNEL_ITEMS),
    ...UPGRADE_IDS.map(trackItemOf),
    ...BAY_IDS.map(bayItemOf),
    artefactItemOf('any'),
    liningItemOf('any'),
  ]
  return new Set(refs.map((ref) => ref.kind))
}

describe('bare catalogue ids', () => {
  it('accepts an id under each #162 category and tech', () => {
    const ids = [
      'power.mineral_drain',
      'consumable.stabiliser_foam',
      'passive.assay_lens',
      'gear.twin_bit',
      'rig.resonance',
      'slot.powerup_4',
      'tech.terrain.cradle_4',
      'tech.combo.gen.41',
    ]
    expect(ids.flatMap(bareCatalogueIdProblems)).toEqual([])
  })

  it('refuses an id with no category', () => {
    expect(bareCatalogueIdProblems('remote_detonator')).toEqual(['has no category'])
    expect(bareCatalogueIdProblems('.powerup_4')).toEqual(['has no category'])
  })

  it('refuses an id under any other category', () => {
    expect(bareCatalogueIdProblems('mobility.cradle_3')).toEqual([
      'has category "mobility", not one of power, consumable, passive, gear, rig, slot, tech',
    ])
  })

  it('refuses a category with no snake_case name after it', () => {
    expect(bareCatalogueIdProblems('slot.')).toEqual(['has no snake_case name after its category'])
    expect(bareCatalogueIdProblems('slot.Powerup-4')).toEqual([
      'has no snake_case name after its category',
    ])
  })

  it('refuses every row id of the locked horizontal schedule', () => {
    const accepted = LOCKED_SCHEDULE.rows.filter(
      (row) => bareCatalogueIdProblems(row.id).length === 0,
    )
    expect(accepted).toEqual([])
  })

  it('shares no category with the kinds of the kernel items', () => {
    const kernelKinds = kernelItemKinds()
    expect(BARE_CATALOGUE_CATEGORIES.filter((category) => kernelKinds.has(category))).toEqual([])
  })
})
