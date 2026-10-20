import { describe, expect, it } from 'vitest'
import { DEFAULT_MATERIAL_POP_MODE, materialPopModeOfParam } from './materialPopMode'

describe('material pop mode', () => {
  it('defaults to A, as the G&V bar on #442 asks', () => {
    expect(DEFAULT_MATERIAL_POP_MODE).toBe('A')
  })

  it('reads the URL value in either case', () => {
    expect(materialPopModeOfParam('B')).toBe('B')
    expect(materialPopModeOfParam('b')).toBe('B')
    expect(materialPopModeOfParam('a')).toBe('A')
  })

  it('reads no mode from an absent or unknown value', () => {
    expect(materialPopModeOfParam(null)).toBeNull()
    expect(materialPopModeOfParam('')).toBeNull()
    expect(materialPopModeOfParam('C')).toBeNull()
  })
})
