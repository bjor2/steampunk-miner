import { describe, expect, it } from 'vitest'
import { kernelCommandTypes } from '../authority/applyCommand'
import { kernelCommandBuys, listBuyableRefs } from './buyableRefs'
import type { ItemRef } from './itemDescriber'
import {
  ITEM_DESCRIPTION_ENTRY_REGISTRY,
  type ItemDescriptionEntry,
} from './itemDescriptionEntries'
import { addToRegistry, withFreshRegistrySet } from './seal'

const PLANETS_PER_MARK = 40

/** A fake slice's generated Mark, one grade per 40 planets reached (#162-style computed items). */
const MARK_ENTRY: ItemDescriptionEntry = {
  id: 'fake.mark',
  matches: { kind: 'module', idPrefix: 'mark_' },
  flavour: 'A finer temper.',
  statLines: [],
  refs: (planetIndex) => [
    { kind: 'module', id: 'mark_drill', grade: Math.ceil(planetIndex / PLANETS_PER_MARK) },
  ],
}

function withMarkEntry<T>(run: () => T): T {
  return withFreshRegistrySet(
    () => addToRegistry(ITEM_DESCRIPTION_ENTRY_REGISTRY, 'fake', MARK_ENTRY),
    run,
  )
}

const keyOf = (ref: ItemRef) =>
  `${ref.kind}:${ref.id}${ref.grade === undefined ? '' : `#${ref.grade}`}`

describe('buyable refs', () => {
  it('lists every buyable on main once, sorted by kind and id', () => {
    const keys = withFreshRegistrySet(
      () => undefined,
      () => listBuyableRefs().map(keyOf),
    )
    expect(keys).toEqual([
      'artefact:artefact.assay_beacon',
      'artefact:artefact.breathing_room',
      'artefact:artefact.ore_whisper',
      'bay:refinery',
      'bay:sell',
      'bay:upgrade',
      'module:casing',
      'module:charge_rack',
      'module:charges',
      'module:guns',
      'module:refinery_slot',
      'module:refractory_lining',
      'service:quick_service',
      'service:recharge',
      'service:refine',
      'service:repair',
      'service:travel',
      'track:boiler',
      'track:cargo_hold',
      'track:drill_power',
      'track:drill_tip',
      'track:engine',
      'track:hull',
    ])
  })

  it('places every kernel player command as a buy or not, so a new buy command needs a ref', () => {
    const playerCommands = kernelCommandTypes().filter((type) => !type.startsWith('debug.'))
    expect(Object.keys(kernelCommandBuys()).sort()).toEqual([...playerCommands].sort())
  })

  it("adds a fake slice's generated refs for every planet up to the one asked, each once", () => {
    const marks = withMarkEntry(() =>
      listBuyableRefs(100)
        .filter((ref) => ref.id === 'mark_drill')
        .map(keyOf),
    )
    expect(marks).toEqual(['module:mark_drill#1', 'module:mark_drill#2', 'module:mark_drill#3'])
  })

  it('keeps generated refs past the planet asked out of the list', () => {
    const marks = withMarkEntry(() => listBuyableRefs(40).filter((ref) => ref.id === 'mark_drill'))
    expect(marks).toEqual([{ kind: 'module', id: 'mark_drill', grade: 1 }])
  })
})
