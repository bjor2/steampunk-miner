import { describe, expect, it } from 'vitest'
import type { SliceDefinition } from './sliceDefinition'
import { SliceFolderError, slicesOfModules } from './sliceModules'

function moduleOf(id: string): { slice: SliceDefinition } {
  return { slice: { id, register: () => undefined } }
}

describe('slice modules', () => {
  it('takes each folder whose slice id is its folder name', () => {
    const slices = slicesOfModules({
      './ores/register.ts': moduleOf('ores'),
      './example/register.ts': moduleOf('example'),
    })
    expect(slices.map(({ id }) => id)).toEqual(['ores', 'example'])
  })

  it('refuses a slice whose id is not its folder name', () => {
    expect(() => slicesOfModules({ './ores/register.ts': moduleOf('ore-catalogue') })).toThrow(
      /src\/features\/ores\/register.ts declares slice id "ore-catalogue"/,
    )
  })

  it('refuses one slice id declared by two folders, naming both', () => {
    const modules = {
      './ores/register.ts': moduleOf('ores'),
      './ores-copy/register.ts': moduleOf('ores'),
    }
    expect(() => slicesOfModules(modules)).toThrow(SliceFolderError)
    expect(() => slicesOfModules(modules)).toThrow(
      'slice id "ores" is declared by src/features/ores and by src/features/ores-copy',
    )
  })
})
