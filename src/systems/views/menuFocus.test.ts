import { describe, expect, it } from 'vitest'
import { focusOnScreen, jumpFocusToPanel, stepFocus, type FocusStop } from './menuFocus'

const STOPS: FocusStop[] = [
  { id: 'shop-sell-all', panel: 'shop' },
  { id: 'workshop-upgrade-engine-buy', panel: 'workshop' },
  { id: 'workshop-repair', panel: 'workshop' },
  { id: 'platform-undock', panel: 'footer' },
]

describe('menu focus', () => {
  it('steps through the controls in reading order and wraps', () => {
    expect(stepFocus(STOPS, 'shop-sell-all', 1)).toBe('workshop-upgrade-engine-buy')
    expect(stepFocus(STOPS, 'shop-sell-all', -1)).toBe('platform-undock')
  })

  it('jumps to the first control of the next or previous panel', () => {
    expect(jumpFocusToPanel(STOPS, 'shop-sell-all', 1)).toBe('workshop-upgrade-engine-buy')
    expect(jumpFocusToPanel(STOPS, 'workshop-repair', 1)).toBe('platform-undock')
    expect(jumpFocusToPanel(STOPS, 'shop-sell-all', -1)).toBe('platform-undock')
  })

  it('starts on the screen default when the focused control is gone', () => {
    expect(focusOnScreen(STOPS, 'shop-sell-3', 'platform-undock')).toBe('platform-undock')
    expect(focusOnScreen(STOPS, 'workshop-repair', 'platform-undock')).toBe('workshop-repair')
  })
})
