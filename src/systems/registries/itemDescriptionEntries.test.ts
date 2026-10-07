import { describe, expect, it } from 'vitest'
import {
  ITEM_DESCRIPTION_ENTRY_REGISTRY,
  itemDescriptionEntryOf,
  type ItemDescriptionEntry,
  type ItemMatch,
} from './itemDescriptionEntries'
import { addToRegistry, RegistrationRefusedError, withFreshRegistrySet } from './seal'

function entryOf(id: string, matches: ItemMatch): ItemDescriptionEntry {
  return { id, matches, flavour: 'A plain line.', statLines: [] }
}

function sealWith(...entries: readonly ItemDescriptionEntry[]): void {
  withFreshRegistrySet(
    () => entries.forEach((entry) => addToRegistry(ITEM_DESCRIPTION_ENTRY_REGISTRY, 'fake', entry)),
    () => undefined,
  )
}

const MARK = entryOf('fake.mark', { kind: 'track', idPrefix: 'mark_' })
const DRILL = entryOf('fake.drill', { kind: 'track', id: 'drill_power' })
const ALL_MODULES = entryOf('fake.modules', { kind: 'module' })

describe('item description entries', () => {
  it('finds the one entry matching a ref by exact id or id prefix', () => {
    const found = withFreshRegistrySet(
      () => [MARK, DRILL].forEach((e) => addToRegistry(ITEM_DESCRIPTION_ENTRY_REGISTRY, 'fake', e)),
      () => [
        itemDescriptionEntryOf({ kind: 'track', id: 'mark_drill', grade: 3 })?.id,
        itemDescriptionEntryOf({ kind: 'track', id: 'drill_power' })?.id,
        itemDescriptionEntryOf({ kind: 'track', id: 'engine' }),
        itemDescriptionEntryOf({ kind: 'module', id: 'mark_drill' }),
      ],
    )
    expect(found).toEqual(['fake.mark', 'fake.drill', null, null])
  })

  it('refuses two entries with the same exact match at seal time', () => {
    const twin = entryOf('fake.drill-twin', { kind: 'track', id: 'drill_power' })
    expect(() => sealWith(DRILL, twin)).toThrow(RegistrationRefusedError)
  })

  it('refuses an id prefix that covers another entry’s exact id', () => {
    const prefix = entryOf('fake.drills', { kind: 'track', idPrefix: 'drill_' })
    expect(() => sealWith(DRILL, prefix)).toThrow(/"fake.drill".*"fake.drills"/)
  })

  it('refuses nested id prefixes and a whole-kind match beside any other of its kind', () => {
    const longer = entryOf('fake.mark-drill', { kind: 'track', idPrefix: 'mark_drill' })
    const oneModule = entryOf('fake.casing', { kind: 'module', id: 'casing' })
    expect(() => sealWith(MARK, longer)).toThrow(RegistrationRefusedError)
    expect(() => sealWith(ALL_MODULES, oneModule)).toThrow(RegistrationRefusedError)
  })

  it('seals entries that can never match the same ref', () => {
    const casing = entryOf('fake.casing', { kind: 'module', id: 'casing' })
    const engine = entryOf('fake.engine', { kind: 'track', id: 'engine' })
    const outsidePrefix = entryOf('fake.hull', { kind: 'track', id: 'hull', idPrefix: 'mark_' })
    expect(() => sealWith(MARK, DRILL, casing, engine, outsidePrefix)).not.toThrow()
  })
})
