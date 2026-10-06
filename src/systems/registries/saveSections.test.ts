import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import {
  readSection,
  SAVE_SECTION_REGISTRY,
  saveSectionsOf,
  withSection,
  type SaveSection,
} from './saveSections'
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

  it("reads a section the state does not hold as the section's initial value", () => {
    const state = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
    expect(readSection(state, 'p1', counterSection('codex', 'player'))).toBe(0)
  })

  it('writes a player section on that player only', () => {
    const codex = counterSection('codex', 'player')
    const start = createAuthorityState({
      planetIndex: 1,
      planetSeed: 83921,
      playerIds: ['p1', 'p2'],
    })
    const state = withSection(start, 'p2', codex, 4)
    expect([readSection(state, 'p1', codex), readSection(state, 'p2', codex)]).toEqual([0, 4])
    expect('slices' in state).toBe(false)
  })
})
