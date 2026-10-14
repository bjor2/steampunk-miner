import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { toCanonical } from '../../../systems/money'
import { selectUpgradeBayModel, type UpgradeBayModel } from '../../../systems/views/upgradeBayModel'
import { MOUNT_PART_ID, trackPartIdOf } from './boreGunContent'
import { gunLevelsOf } from './gunLevels'
import { mountPrice, nextLevelPrice } from './gunPurchase'
import { wallLevelOf } from './gunTracks'

// The bore gun at the Upgrade bay through the kernel's bay entries (ticket 314, TD lock section 1).

const TRACK_ENTRY_IDS = ['rate', 'penetration', 'energy'].map((track) =>
  trackPartIdOf(track as 'rate'),
)

function dockedOn(planetIndex: number): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex } })
  session.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  session.submit(0, { type: 'debug.grantMoney', payload: { amount: '1000000' } })
  return session
}

function bayOf(session: ScriptedSession): UpgradeBayModel {
  return selectUpgradeBayModel(session.state(), 'p1', {
    isTravelArmed: false,
    isQuickServiceHighlighted: false,
    focusedId: null,
    installingUpgradeId: null,
  })
}

function entryOf(session: ScriptedSession, entryId: string) {
  const entry = bayOf(session).entries.find((row) => row.entryId === entryId)
  if (entry === undefined) throw new Error(`no bay entry ${entryId}`)
  return entry
}

function pressBuy(session: ScriptedSession, tick: number, entryId: string) {
  const action = entryOf(session, entryId).buy?.action
  if (action?.kind !== 'submit') throw new Error(`${entryId} has no buy to press`)
  return session.submit(tick, action.intent as CommandIntent)
}

const wallsIntent: CommandIntent = {
  type: 'debug.ground-gun.setLevels',
  payload: {
    rate: wallLevelOf('rate'),
    penetration: wallLevelOf('penetration'),
    energy: wallLevelOf('energy'),
  },
}

describe('ground-gun: the bore gun at the Upgrade bay', () => {
  it('lists only the mount until the gun is on, priced at the mount debit', () => {
    const session = dockedOn(1)
    const bay = bayOf(session)
    expect(bay.entries.map((row) => row.entryId)).toEqual([MOUNT_PART_ID])
    expect(bay.entries[0].cost.exact).toBe(toCanonical(mountPrice()))
    expect(bay.entries[0].isBuyOpen).toBe(true)
  })

  it('mounts the gun when its buy is pressed, then lists the three tracks', () => {
    const session = dockedOn(1)
    pressBuy(session, 1, MOUNT_PART_ID)
    expect(gunLevelsOf(session.state(), 'p1')).toEqual({ rate: 1, penetration: 1, energy: 1 })
    expect(
      bayOf(session)
        .entries.map((row) => row.entryId)
        .sort(),
    ).toEqual([...TRACK_ENTRY_IDS].sort())
  })

  it('shows each track at the price its buy debits, and the buy raises that track', () => {
    const session = dockedOn(1)
    pressBuy(session, 1, MOUNT_PART_ID)
    const price = nextLevelPrice(gunLevelsOf(session.state(), 'p1'), 'penetration')
    const entry = entryOf(session, trackPartIdOf('penetration'))
    expect(entry.cost.exact).toBe(toCanonical(price!))
    expect(entry.levelText).toBe('1 → 2')
    const events = pressBuy(session, 2, trackPartIdOf('penetration'))
    expect(events[0]).toMatchObject({
      type: 'ground-gun.TrackLevelBought',
      price: entry.cost.exact,
    })
  })

  it('keeps a track at its wall listed as Mastered, with no buy and no focus stop', () => {
    const session = dockedOn(1)
    session.submit(1, wallsIntent)
    const bay = bayOf(session)
    expect(bay.entries).toHaveLength(3)
    expect(bay.entries.every((row) => row.isMastered && row.buy === null)).toBe(true)
    expect(bay.entries.every((row) => row.badge === 'maxed')).toBe(true)
    const entryBuyIds = bay.entries.map((row) => `upgradebay-entry-${row.entryId}-buy`)
    expect(bay.buttons.filter((button) => entryBuyIds.includes(button.id))).toEqual([])
  })

  it('carries the #159 card of each part, priced at none once nothing is for sale', () => {
    const session = dockedOn(1)
    expect(entryOf(session, MOUNT_PART_ID).card.description).not.toBeNull()
    session.submit(1, wallsIntent)
    const rate = entryOf(session, trackPartIdOf('rate'))
    expect(rate.card.item).toEqual({ kind: 'bore-gun', id: trackPartIdOf('rate') })
    expect(rate.card.cost).toBeNull()
  })
})
