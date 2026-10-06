import { describe, expect, it } from 'vitest'
import { createScriptedSession, dockInBay } from '../authority/scriptedSession'
import { buyCasingGradeCommand, buyUpgradeCommand } from '../platform/platformCommands'
import { grantMoneyCommand } from '../startScenarioCommands'
import {
  bayTransitionOf,
  partInstallSecondsOf,
  partToInstallOf,
  shopTypeOf,
} from './bayPresentation'
import { shopTextPixelsOf } from './screenLayout'

function purchaseEvents(run: (session: ReturnType<typeof createScriptedSession>) => void) {
  const session = createScriptedSession(['p1', 'p2'])
  session.submit(1, grantMoneyCommand('1e6'))
  dockInBay(session, 2, 'upgrade')
  const before = session.events().length
  run(session)
  return session.events().slice(before)
}

describe('bay screen presentation', () => {
  it('opens and closes a bay screen with a 0.25 s brass shutter', () => {
    expect(bayTransitionOf(false)).toEqual({ kind: 'shutter', seconds: 0.25 })
  })

  it('fades instead of sliding with reduce motion on', () => {
    expect(bayTransitionOf(true)).toEqual({ kind: 'fade', seconds: 0.25 })
  })

  it('installs a bought part over 0.4 s, and instantly with reduce motion', () => {
    expect(partInstallSecondsOf(false)).toBe(0.4)
    expect(partInstallSecondsOf(true)).toBe(0)
  })

  it('starts installing the track the local player just bought', () => {
    const events = purchaseEvents((session) => session.submit(3, buyUpgradeCommand('boiler')))
    expect(partToInstallOf(events, 'p1', false)).toBe('boiler')
  })

  it('installs nothing for another player, a casing grade, or with reduce motion', () => {
    const bought = purchaseEvents((session) => session.submit(3, buyUpgradeCommand('boiler')))
    const casing = purchaseEvents((session) => session.submit(3, buyCasingGradeCommand()))
    expect(partToInstallOf(bought, 'p2', false)).toBeNull()
    expect(partToInstallOf(casing, 'p1', false)).toBeNull()
    expect(partToInstallOf(bought, 'p1', true)).toBeNull()
  })

  it("reports the screen's short axis beside the shop text the layout set", () => {
    expect(shopTypeOf(1920, 1080, shopTextPixelsOf(1080, false))).toEqual({
      shortAxisPixels: 1080,
      smallestTextPixels: shopTextPixelsOf(1080, false),
    })
    expect(shopTypeOf(1080, 1920, 17.6).shortAxisPixels).toBe(1080)
  })
})
