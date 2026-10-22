import { describe, expect, it } from 'vitest'
import { buyUpgradeCommand } from '../platform/platformCommands'
import { grantMoneyCommand } from '../startScenarioCommands'
import { setUpgradeCommand } from '../vehicle/vehicleCommands'
import { CLICK_CHAIN } from './purchaseChain'
import { createScriptedSession, dockInBay, typesOf } from './scriptedSession'
import { effectiveTravelSpeedOf, travelEngineAt } from './travelSpeed'

// Bjor's ruling on #723: buying a drill upgrade never changes drive speed. Travel parity (ticket
// 333) let `k` times the drill's cut set travel; with it retired the drive is the engine alone.

/** A rig docked at the Upgrade bay with money to spare, with `levels` set. */
function dockedSessionWith(levels: Record<string, number>) {
  const session = createScriptedSession()
  session.submit(1, grantMoneyCommand('1e60'))
  for (const [track, level] of Object.entries(levels)) {
    session.submit(1, setUpgradeCommand(track, level))
  }
  dockInBay(session, 2, 'upgrade')
  return session
}

/** The drive as the motion rule and every speed-scaled effect read it, as exact text. */
function driveBytesOf(session: ReturnType<typeof dockedSessionWith>): string {
  const state = session.state()
  return JSON.stringify([effectiveTravelSpeedOf(state, 'p1'), travelEngineAt(state, 'p1')])
}

describe('drive speed across a drill purchase (ticket 723)', () => {
  it.each([
    ['a starting rig', {}],
    ['a drill once past the engine', { drill_power: 17, drill_tip: 200 }],
    ['a drill past the old 3600 m/s floor', { drill_power: 106, drill_tip: 600 }],
  ])('leaves the drive byte-identical when %s buys drill power', (_name, levels) => {
    const session = dockedSessionWith(levels)
    const before = driveBytesOf(session)
    const events = session.submit(3, buyUpgradeCommand('drill_power', CLICK_CHAIN))
    expect(typesOf(events)).toContain('UpgradePurchased')
    expect(driveBytesOf(session)).toBe(before)
  })

  it('leaves the drive byte-identical when the rig buys a drill tip', () => {
    const session = dockedSessionWith({ drill_power: 17, drill_tip: 200 })
    const before = driveBytesOf(session)
    const events = session.submit(3, buyUpgradeCommand('drill_tip', CLICK_CHAIN))
    expect(typesOf(events)).toContain('UpgradePurchased')
    expect(driveBytesOf(session)).toBe(before)
  })

  it('moves the drive when the rig buys the engine', () => {
    const session = dockedSessionWith({})
    const before = driveBytesOf(session)
    session.submit(3, buyUpgradeCommand('engine', CLICK_CHAIN))
    expect(driveBytesOf(session)).not.toBe(before)
  })
})
