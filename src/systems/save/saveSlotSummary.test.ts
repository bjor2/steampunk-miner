import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../authority/authorityCommand'
import {
  createScriptedSession,
  mineTile,
  PARAMS,
  surfaceOreTiles,
} from '../authority/scriptedSession'
import { takeSnapshot } from '../authority/sessionSnapshot'
import { planetDisplayNameOf } from '../registries/planetRow'
import { coreDepthOf } from '../world/openedDepth'
import { fromCanonical, toCanonical } from '../money'
import { depthTilesAt } from '../world/planetGeometry'
import { readSaveSlot, saveSlotOf, summarisedSaveSlotOf } from './saveSlot'
import { manualSlotKey, readSlotEntry, slotEntryOfFile } from './saveSlotIndex'
import { readSlotSummary, slotSummaryOf } from './saveSlotSummary'

const SLOT = { name: 'Deep vein', savedAtMs: 1_760_000_000_000 }
const grant = (amount: string): CommandIntent => ({ type: 'debug.grantMoney', payload: { amount } })
const setDrillPower = (level: number): CommandIntent => ({
  type: 'debug.setUpgrade',
  payload: { upgradeId: 'drill_power', level },
})

/** A planet 1 session with 1e300 in the wallet and the drill power at level 1e6. */
function richSession() {
  const session = createScriptedSession()
  session.submit(1, grant('1e300'))
  session.submit(2, setDrillPower(1_000_000))
  return session
}

/** The summary as the slot list reads it back: the file as JSON text, then its entry. */
function entrySummaryOfText(text: string) {
  return slotEntryOfFile(manualSlotKey(1), JSON.parse(text))?.summary
}

describe('save slot summary (ticket 703)', () => {
  it('names the planet, its display name, the wallet and the drill level of the player', () => {
    const session = createScriptedSession()
    session.submit(1, grant('1234.5'))
    expect(slotSummaryOf(takeSnapshot(session.state()).state, 'p1')).toEqual({
      planetIndex: 1,
      planetName: planetDisplayNameOf(1),
      money: toCanonical(fromCanonical('1234.5')),
      deepestMetres: 0,
      coreDepthMetres: coreDepthOf(PARAMS),
      drillLevel: 0,
    })
  })

  it('records the deepest metre the dig has opened', () => {
    const session = createScriptedSession()
    const tiles = surfaceOreTiles(3)
    tiles.forEach((tile, index) => mineTile(session, 10 + 50 * index, tile))
    const deepest = Math.max(...tiles.map((tile) => depthTilesAt(PARAMS, tile.tx, tile.ty)))
    const summary = slotSummaryOf(takeSnapshot(session.state()).state, 'p1')
    expect(summary?.deepestMetres).toBe(deepest)
  })

  it('is null for a player the session does not hold', () => {
    expect(slotSummaryOf(takeSnapshot(createScriptedSession().state()).state, 'p9')).toBeNull()
  })

  it('keeps money at 1e300 and drill level 1e6 exactly through the file and its entry', () => {
    const snapshot = takeSnapshot(richSession().state())
    const text = JSON.stringify(summarisedSaveSlotOf(snapshot, 1, SLOT, 'p1'))
    const summary = entrySummaryOfText(text)
    expect(summary?.money).toBe(snapshot.state.players.p1.wallet)
    expect(summary?.money).toBe(toCanonical(fromCanonical('1e300')))
    expect(summary?.drillLevel).toBe(1_000_000)
  })

  it('carries the summary through the entry the shell keeps beside the file', () => {
    const snapshot = takeSnapshot(richSession().state())
    const file = summarisedSaveSlotOf(snapshot, 1, SLOT, 'p1')
    const keptText = JSON.stringify(slotEntryOfFile(manualSlotKey(1), file))
    expect(readSlotEntry(JSON.parse(keptText))?.summary).toEqual(file.summary)
  })

  it('is never read back into play: a save loads the same with or without it', () => {
    const snapshot = takeSnapshot(richSession().state())
    const withSummary = readSaveSlot(summarisedSaveSlotOf(snapshot, 1, SLOT, 'p1'))
    const without = readSaveSlot(saveSlotOf(snapshot, 1, SLOT))
    expect(withSummary).toEqual(without)
  })

  it('leaves an old save, or an entry kept without one, unknown and still loadable', () => {
    const file = saveSlotOf(takeSnapshot(createScriptedSession().state()), 1, SLOT)
    const entry = slotEntryOfFile(manualSlotKey(1), JSON.parse(JSON.stringify(file)))
    expect(entry).not.toBeNull()
    expect(entry?.summary).toBeUndefined()
    expect(readSlotEntry(JSON.parse(JSON.stringify(entry)))?.summary).toBeUndefined()
    expect(readSaveSlot(file).problems).toEqual([])
  })

  it('reads a summary it cannot trust as unknown, never as part of one', () => {
    const summary = slotSummaryOf(takeSnapshot(richSession().state()).state, 'p1')
    expect(readSlotSummary(summary)).toEqual(summary)
    expect(readSlotSummary({ ...summary, money: 1e300 })).toBeUndefined()
    expect(readSlotSummary({ ...summary, deepestMetres: 12.5 })).toBeUndefined()
    expect(readSlotSummary({ ...summary, planetName: null })).toBeUndefined()
    expect(readSlotSummary('Planet 1')).toBeUndefined()
  })
})
