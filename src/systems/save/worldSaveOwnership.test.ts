import { describe, expect, it } from 'vitest'
import { canWriteWorldSave, worldSaveWriteProblems } from './worldSaveOwnership'

describe('world save ownership (ticket 407)', () => {
  it('lets the host write the world save', () => {
    expect(worldSaveWriteProblems('host')).toEqual([])
    expect(canWriteWorldSave('host')).toBe(true)
  })

  it('never lets a guest write a world save', () => {
    expect(worldSaveWriteProblems('guest')).toEqual([
      'a guest never writes a world save: the host owns the world it joined',
    ])
    expect(canWriteWorldSave('guest')).toBe(false)
  })
})
