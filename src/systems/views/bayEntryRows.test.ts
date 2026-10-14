import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import { createScriptedSession, type ScriptedSession } from '../authority/scriptedSession'
import { entryProbeSlice, probeSourceOf } from '../registries/bayEntryFixtures'
import { vehicleItemRefOf } from '../registries/kernelItems'
import { RegistrationRefusedError } from '../registries/seal'
import { UI_ID_TEMPLATES } from './screenIds'
import { selectUpgradeBayModel, type UpgradeBayModel } from './upgradeBayModel'

// The Upgrade bay's bay entries (ticket 344, TD lock on #314 section 1). `blasting_charges` opens
// on planet 7, `bore_gun` on planet 1 and earlier in the schedule, `magma_tick` is a vision row.

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

function entryIdsOf(bay: UpgradeBayModel): string[] {
  return bay.entries.map((row) => row.entryId)
}

describe('the Upgrade bay entries (ticket 344)', () => {
  it("lists a source anchored on a shipped row on planet 1 too: its row's planet only prices it (#411)", () => {
    const charges = probeSourceOf('entry-probe.charges', 'blasting_charges', [
      { entryId: 'entry-probe.rack' },
    ])
    withRegistrations([entryProbeSlice([charges.source])], () => {
      expect(entryIdsOf(bayOf(dockedOn(1)))).toEqual(['entry-probe.rack'])
      expect(entryIdsOf(bayOf(dockedOn(7)))).toEqual(['entry-probe.rack'])
    })
  })

  it('never lists or asks a source anchored on a vision row', () => {
    const vision = probeSourceOf('entry-probe.magma', 'magma_tick', [
      { entryId: 'entry-probe.tick' },
    ])
    withRegistrations([entryProbeSlice([vision.source])], () => {
      expect(entryIdsOf(bayOf(dockedOn(12)))).toEqual([])
      expect(vision.asks()).toBe(0)
    })
  })

  it('sorts entries by their anchor schedule row, then by entry id', () => {
    const charges = probeSourceOf('entry-probe.a-charges', 'blasting_charges', [
      { entryId: 'entry-probe.b-rack' },
      { entryId: 'entry-probe.a-fuse' },
    ])
    const bore = probeSourceOf('entry-probe.z-bore', 'bore_gun', [
      { entryId: 'entry-probe.z-track' },
    ])
    withRegistrations([entryProbeSlice([charges.source, bore.source])], () => {
      expect(entryIdsOf(bayOf(dockedOn(7)))).toEqual([
        'entry-probe.z-track',
        'entry-probe.a-fuse',
        'entry-probe.b-rack',
      ])
    })
  })

  it('refuses an entry whose id names an unlock id', () => {
    const named = probeSourceOf('entry-probe.tracks', 'bore_gun', [
      { entryId: 'entry-probe.auto_guns' },
    ])
    withRegistrations([entryProbeSlice([named.source])], () => {
      expect(() => bayOf(dockedOn(1))).toThrow(RegistrationRefusedError)
    })
  })

  it('never previews a held item, an unregistered vehicle item', () => {
    const held = probeSourceOf('entry-probe.tracks', 'bore_gun', [
      { entryId: 'entry-probe.siphon', item: vehicleItemRefOf('power.siphon') },
      { entryId: 'entry-probe.track' },
    ])
    withRegistrations([entryProbeSlice([held.source])], () => {
      expect(entryIdsOf(bayOf(dockedOn(1)))).toEqual(['entry-probe.track'])
    })
  })

  it('keeps a track at its wall listed as Mastered, with no buy and no focus stop', () => {
    const walled = probeSourceOf('entry-probe.tracks', 'bore_gun', [
      { entryId: 'entry-probe.range', isMastered: true },
    ])
    withRegistrations([entryProbeSlice([walled.source])], () => {
      const bay = bayOf(dockedOn(1))
      expect(bay.entries[0]).toMatchObject({ isMastered: true, buy: null, badge: 'maxed' })
      const buyId = UI_ID_TEMPLATES.upgradebayEntryBuy('entry-probe.range')
      expect(bay.buttons.map((button) => button.id)).not.toContain(buyId)
      expect(bay.focusStops.map((stop) => stop.id)).not.toContain(buyId)
    })
  })

  it('puts the entry buys after the item rows and before repair in the focus order', () => {
    const bore = probeSourceOf('entry-probe.tracks', 'bore_gun', [{ entryId: 'entry-probe.rate' }])
    withRegistrations([entryProbeSlice([bore.source])], () => {
      const panels = bayOf(dockedOn(1)).focusStops.map((stop) => stop.panel)
      expect(panels.indexOf('entries')).toBe(panels.indexOf('repair') - 1)
    })
  })

  it('leaves every other row and focus stop as it was with no entry registered', () => {
    const before = withRegistrations([], () => bayOf(dockedOn(7)))
    const bore = probeSourceOf('entry-probe.tracks', 'bore_gun', [{ entryId: 'entry-probe.rate' }])
    const after = withRegistrations([entryProbeSlice([bore.source])], () => bayOf(dockedOn(7)))
    expect(before.entries).toEqual([])
    expect(after.focusStops.filter((stop) => stop.panel !== 'entries')).toEqual(before.focusStops)
    expect({ ...after, entries: [], focusStops: [], buttons: [] }).toEqual({
      ...before,
      focusStops: [],
      buttons: [],
    })
  })
})
