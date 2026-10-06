import { describe, expect, it } from 'vitest'
import { SAVE_SECTION_REGISTRY, saveSectionsOf, type SaveSection } from './saveSections'
import { addToRegistry, withFreshRegistrySet } from './seal'

function counterSection(id: string, scope: 'session' | 'player'): SaveSection<number> {
  return {
    id,
    version: 1,
    scope,
    initial: 0,
    problems: (body) => (Number.isSafeInteger(body) ? [] : [`${id}: not a whole number`]),
    toPortable: (value) => value,
    ofPortable: (body) => body as number,
  }
}

describe('save sections registry', () => {
  it('lists the sections of one scope sorted by id', () => {
    const ids = withFreshRegistrySet(
      () => {
        addToRegistry(SAVE_SECTION_REGISTRY, 'tech-tree', counterSection('tech-tree', 'player'))
        addToRegistry(SAVE_SECTION_REGISTRY, 'codex', counterSection('codex', 'player'))
        addToRegistry(
          SAVE_SECTION_REGISTRY,
          'mining-gates',
          counterSection('mining-gates', 'session'),
        )
      },
      () => saveSectionsOf('player').map((section) => section.id),
    )
    expect(ids).toEqual(['codex', 'tech-tree'])
  })
})
