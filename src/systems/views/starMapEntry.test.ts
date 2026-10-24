import { describe, expect, it } from 'vitest'
import { isStarMapButtonShown } from './starMapEntry'

// Ticket 792: the phone's star map button is there whenever M would open the map.

describe('star map entry (ticket 792)', () => {
  it('shows the button while driving and while docked at any bay', () => {
    expect(isStarMapButtonShown('vehicle')).toBe(true)
    expect(isStarMapButtonShown('platform')).toBe(true)
  })

  it('hides it under the pause menu, the sheet, an artefact card and the title', () => {
    for (const layer of ['pause', 'sheet', 'artefact', 'title'] as const)
      expect(isStarMapButtonShown(layer)).toBe(false)
  })
})
