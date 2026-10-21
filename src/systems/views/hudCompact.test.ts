import { describe, expect, it } from 'vitest'
import { compactChipValueOf, isUprightCompactHud } from './hudCompact'

describe('compact HUD rows (#486)', () => {
  it('lays threats and prompts out as rows only on the compact HUD held upright', () => {
    expect(isUprightCompactHud('compact', 'portrait')).toBe(true)
    expect(isUprightCompactHud('compact', 'landscape')).toBe(false)
    expect(isUprightCompactHud('full', 'portrait')).toBe(false)
    expect(isUprightCompactHud('full', 'landscape')).toBe(false)
  })

  it('keeps the numbers a chip title carries to draw beside its icon', () => {
    expect(compactChipValueOf('THREATS x2')).toBe('x2')
    expect(compactChipValueOf('CHARGE LIT 0.5s')).toBe('0.5s')
    expect(compactChipValueOf('tow in 10s')).toBe('10s')
  })

  it('draws no number for a title of words alone', () => {
    expect(compactChipValueOf('HULL CRITICAL')).toBe('')
    expect(compactChipValueOf('FULL')).toBe('')
  })
})
