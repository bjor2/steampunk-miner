import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { withVehicle } from '../../systems/authority/authorityState'
import {
  dockAtBayOf,
  mineSurfaceOre,
  REFINERY_SITE,
  sessionOnPlanet,
} from '../../systems/authority/refinery/refineryFixtures'
import {
  continueScriptedSession,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import { fromCanonical } from '../../systems/money'
import type { BayUiState } from '../../systems/views/bayFrame'
import { selectRefineryBayModel } from '../../systems/views/refineryBayModel'
import { selectSellBayModel } from '../../systems/views/sellBayModel'
import { forgetUiTexts, registeredUiTexts, type UiTextLine } from '../../systems/views/uiText'
import { uiTextProblemsOf } from '../../systems/views/uiTextBudget'
import { unregisteredTextsOf } from '../../systems/views/unregisteredText'
import { RefineryBayView } from './RefineryBayView'
import { SellBayView } from './SellBayView'

// Spec #422's text budget on the dock (pass #427) past the start scenario the budget test draws:
// the Sell bay with refined batches and a lining bill, and the Refinery bay with ore, a running
// batch and every slot built. Every text sits on a shared element, and prices stay visible.

const UI: BayUiState = {
  isTravelArmed: false,
  isQuickServiceHighlighted: false,
  focusedId: null,
  installingUpgradeId: null,
}

/** Long enough for any batch the fixture queues to be ready. */
const REFINE_WAIT_TICKS = 60 * 60 * 10

beforeEach(() => {
  forgetUiTexts()
})

describe('dock text budget (spec #422, pass #427)', () => {
  it('draws the Sell bay with refined batches and a lining bill on registered elements only', () => {
    const markup = sellBayMarkupOf(withLiningBill(sessionWithReadyBatch()))
    expect(markup).toContain('data-ui-text="dock.refined.collect"')
    expect(markup).toContain('data-ui-text="dock.lining.billed"')
    expect(unregisteredTextsOf(markup)).toEqual([])
    expect(registeredUiTexts().flatMap(uiTextProblemsOf)).toEqual([])
  })

  it('keeps every Sell bay price on its element, never in a tooltip', () => {
    sellBayMarkupOf(withLiningBill(sessionWithReadyBatch()))
    const lines = everyRecordedLine()
    expect(lines.filter((line) => line.holds === 'price').length).toBeGreaterThan(5)
    expect(lines.filter((line) => line.holds !== undefined && line.tag === 'tooltip')).toEqual([])
  })

  it('draws the Refinery bay with ore and a running batch on registered elements only', () => {
    const { session, tick } = atRefineryWithOre()
    session.submit(tick + 1, queueOf(session, 2))
    const markup = refineryBayMarkupOf(session)
    expect(markup).toContain('data-ui-text="dock.refinery.slot0"')
    expect(unregisteredTextsOf(markup)).toEqual([])
    expect(registeredUiTexts().flatMap(uiTextProblemsOf)).toEqual([])
  })

  it('says every slot is built once the refinery has them all, with no price left to show', () => {
    const { session, tick } = atRefineryWithOre()
    session.submit(tick + 1, { type: 'buyRefinerySlot', payload: {} })
    session.submit(tick + 2, { type: 'buyRefinerySlot', payload: {} })
    const markup = refineryBayMarkupOf(session)
    expect(markup).toContain('All slots built')
    expect(unregisteredTextsOf(markup)).toEqual([])
  })
})

/** Planet 3, six band-1 ore in the hold, docked at the Refinery bay. */
function atRefineryWithOre() {
  const session = sessionOnPlanet(3, '1e30')
  session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_power', level: 250 } })
  session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_tip', level: 130 } })
  const tick = mineSurfaceOre(session, 10, 6)
  dockAtBayOf(session, tick, REFINERY_SITE, 'refinery')
  return { session, tick }
}

function queueOf(session: ScriptedSession, units: number) {
  const resourceTier = Number.parseInt(Object.keys(session.state().players.p1.vehicle.cargo.ore)[0])
  return { type: 'queueRefine', payload: { resourceTier, units } } as const
}

/** A ready batch of two units, docked at the Sell bay with the rest of the hold. */
function sessionWithReadyBatch(): ScriptedSession {
  const { session, tick } = atRefineryWithOre()
  session.submit(tick + 1, queueOf(session, 2))
  const readyTick = tick + 1 + REFINE_WAIT_TICKS
  session.advanceTo(readyTick)
  dockAtBayOf(session, readyTick, REFINERY_SITE, 'sell')
  return session
}

/** 25 of lining owed on the vehicle, as a dig in a lined planet leaves it (#128). */
function withLiningBill(session: ScriptedSession): ScriptedSession {
  const state = session.state()
  const vehicle = { ...state.players.p1.vehicle, liningBill: fromCanonical('25') }
  return continueScriptedSession(withVehicle(state, 'p1', vehicle))
}

function sellBayMarkupOf(session: ScriptedSession): string {
  const model = selectSellBayModel(session.state(), 'p1', UI)
  return renderToString(createElement(SellBayView, { model, focusedId: '' }))
}

function refineryBayMarkupOf(session: ScriptedSession): string {
  const model = selectRefineryBayModel(session.state(), 'p1', UI)
  return renderToString(createElement(RefineryBayView, { model, focusedId: '' }))
}

function everyRecordedLine(): UiTextLine[] {
  return registeredUiTexts().flatMap((text) => text.lines)
}
