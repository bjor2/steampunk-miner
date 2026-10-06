import { describe, expect, it } from 'vitest'
import {
  dockAtBayOf,
  mineSurfaceOre,
  REFINERY_SITE,
  sessionOnPlanet,
} from '../authority/refinery/refineryFixtures'
import { createScriptedSession } from '../authority/scriptedSession'
import type { BayUiState } from './bayFrame'
import { refineryBayStartFocus, selectRefineryBayModel } from './refineryBayModel'
import { selectSellBayModel } from './sellBayModel'

const UI: BayUiState = {
  isTravelArmed: false,
  isQuickServiceHighlighted: false,
  focusedId: null,
  installingUpgradeId: null,
}

/** Planet 3, six band-1 ore in the hold, docked at the Refinery bay. */
function atRefineryWithOre() {
  const session = sessionOnPlanet(3, '1e30')
  session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_power', level: 25 } })
  session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_tip', level: 13 } })
  const tick = mineSurfaceOre(session, 10, 6)
  dockAtBayOf(session, tick, REFINERY_SITE, 'refinery')
  return { session, tick }
}

describe('refinery bay screen', () => {
  it('offers each held tier as a batch of at most half the hold, focused first', () => {
    const { session } = atRefineryWithOre()
    const model = selectRefineryBayModel(session.state(), 'p1', UI)
    expect(model.ore.map((row) => [row.held, row.batchUnits])).toEqual([[6, 5]])
    expect(model.ore[0].queue).toMatchObject({ label: 'Refine 5', reason: null })
    expect(refineryBayStartFocus(model)).toBe(model.ore[0].queue.id)
    expect(model.slots).toEqual([{ index: 0, look: 'empty', isYours: false, text: 'Empty' }])
  })

  it('shows a running batch with its seconds left and refuses another with slots_busy', () => {
    const { session, tick } = atRefineryWithOre()
    const tier = session.state().players.p1.vehicle.cargo.ore
    const resourceTier = Number.parseInt(Object.keys(tier)[0], 10)
    session.submit(tick + 1, { type: 'queueRefine', payload: { resourceTier, units: 2 } })
    session.advanceTo(tick + 1 + 60 * 60)
    const model = selectRefineryBayModel(session.state(), 'p1', UI)
    expect(model.slots[0]).toMatchObject({ look: 'refining', isYours: true })
    expect(model.slots[0].text).toContain('120 s')
    expect(model.ore[0].queue.reason).toBe('slots_busy')
  })

  it('prices the next slot, and says so when every slot is built', () => {
    const { session, tick } = atRefineryWithOre()
    expect(selectRefineryBayModel(session.state(), 'p1', UI).slotPrice?.exact).toBe('1.1533008e+4')
    session.submit(tick + 1, { type: 'buyRefinerySlot', payload: {} })
    session.submit(tick + 2, { type: 'buyRefinerySlot', payload: {} })
    const model = selectRefineryBayModel(session.state(), 'p1', UI)
    expect(model.slotPrice).toBeNull()
    expect(model.buySlot.reason).toBe('slots_max')
  })

  it('shows no refined panel at the Sell bay before planet 3', () => {
    const session = createScriptedSession()
    session.submit(1, { type: 'debug.teleportToDock', payload: { bay: 'sell' } })
    const model = selectSellBayModel(session.state(), 'p1', UI)
    expect(model.refined).toBeNull()
    expect(model.buttons.map((button) => button.id)).not.toContain('sellbay-refined-collect')
  })
})
