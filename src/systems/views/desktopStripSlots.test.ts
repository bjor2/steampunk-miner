import { describe, expect, it } from 'vitest'
import { createScriptedSession } from '../authority/scriptedSession'
import { KEYBOARD_PROMPTS } from '../input/promptFixtures'
import { DESIGN_TOKENS } from './designSystem'
import { desktopStripSlotsOf } from './desktopStripSlots'
import { selectHudModel, type HudModel } from './hudModel'
import type { TileTime } from './tileTime'

// Ticket 767 (GD lock 23 Oct): desktop's strip keeps wells for the star map's fuel tank and fuel
// cost, as wide as the shared formatter's widest figure, and tints the depth while gravity limits
// the descent. The phone strip is untouched.

function hudModel(): HudModel {
  return selectHudModel({
    state: createScriptedSession().state(),
    playerId: 'p1',
    depthTiles: 40,
    prompts: KEYBOARD_PROMPTS,
  })
}

const withTileTime = (model: HudModel, tileTime: TileTime): HudModel => ({ ...model, tileTime })

describe('desktop strip slots (ticket 767)', () => {
  it('gives a phone strip no extra slot', () => {
    expect(desktopStripSlotsOf(hudModel(), 'phone')).toBeNull()
  })

  it('keeps the fuel cost well as wide as the widest formatted figure', () => {
    const slots = desktopStripSlotsOf(hudModel(), 'desktop')
    expect(slots?.fuelCostChars).toBe(DESIGN_TOKENS.numbers.maxChars)
    expect(slots?.fuelCostChars).toBe(6)
  })

  it('tints the depth while the gravity ramp holds the cut down', () => {
    const limited = withTileTime(hudModel(), { state: 'gravity', text: '0.16 s', ticks: 10 })
    expect(desktopStripSlotsOf(limited, 'desktop')?.isDescentGravityLimited).toBe(true)
  })

  it('leaves the depth untinted for a drill-bound, drive-bound, blocked or empty readout', () => {
    const others: TileTime[] = [
      { state: 'time', text: '0.16 s', ticks: 10 },
      { state: 'drive', text: '0.16 s · 6 m/s', ticks: 10 },
      { state: 'blocked', text: 'needs a better tip' },
      { state: 'none', text: '-' },
    ]
    for (const tileTime of others) {
      const slots = desktopStripSlotsOf(withTileTime(hudModel(), tileTime), 'desktop')
      expect(slots?.isDescentGravityLimited).toBe(false)
    }
  })
})
