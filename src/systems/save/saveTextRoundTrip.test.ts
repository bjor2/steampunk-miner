import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../authority/authorityState'
import {
  createScriptedSession,
  dockInBay,
  drill,
  mineTile,
  poseAbove,
  surfaceOreTiles,
} from '../authority/scriptedSession'
import { takeSnapshot } from '../authority/sessionSnapshot'
import { toCanonical } from '../money'
import { FACING } from '../vehicle/vehiclePose'
import { arrivedForDive, DIVE_START_TICK, diveTicks, divePathOf, playDive } from './p200DiveFixture'
import { readSaveSlot, saveSlotOf, type SaveSlotFile } from './saveSlot'
import type { SaveSlotMeta } from './saveSlotIndex'

// Ticket 671 (spec #401): the round trip in ticket 405 compares digests; this compares the slot
// text itself. Save, load, save again under the header the slot file carries: the two texts
// are the same bytes, so a load followed by a save never rewrites a slot it did not change.

const MANUAL_SLOT: SaveSlotMeta = { name: 'Before the deep band', savedAtMs: 1_760_000_000_000 }
const SAVE_EPOCH = 7

/** As the shell writes a slot: the JSON text of the save file. */
function slotTextOf(state: AuthorityState): string {
  return JSON.stringify(saveSlotOf(takeSnapshot(state), SAVE_EPOCH, MANUAL_SLOT))
}

/** The slot text loaded, then saved again under the epoch and slot its own header names. */
function resavedTextOf(text: string): string {
  const file = JSON.parse(text) as SaveSlotFile
  const reading = readSaveSlot(file)
  if (!('state' in reading)) throw new Error(reading.problems.join('; '))
  return JSON.stringify(saveSlotOf(takeSnapshot(reading.state), reading.saveEpoch, file.slot))
}

/**
 * Planet 1 mid-run: three ore tiles mined and sold at the Sell bay, back out, and a fourth
 * tile half drilled, with the crawlers left to roam.
 */
function planet1MidRun(): AuthorityState {
  const session = createScriptedSession()
  const [first, second, third, fourth] = surfaceOreTiles(4)
  mineTile(session, 10, first)
  mineTile(session, 60, second)
  mineTile(session, 110, third)
  dockInBay(session, 160, 'sell')
  session.submit(161, { type: 'sellCargo', payload: { resourceTier: 'all' } })
  session.submit(170, { type: 'undock', payload: {} })
  session.submit(171, poseAbove(fourth, FACING.down))
  session.submit(180, drill(fourth, 6))
  session.advanceTo(240)
  return session.state()
}

/** `p1` 160 ticks into the planet-200 dive: mid-cut, money near 1e149. */
function diveMidCut(): AuthorityState {
  const arrived = arrivedForDive()
  return playDive(arrived, diveTicks(divePathOf(arrived), DIVE_START_TICK, 160)).state
}

describe('save slot text: save, load, save (ticket 671)', () => {
  it('writes the same bytes again for a planet-1 run saved mid-run', () => {
    const state = planet1MidRun()
    expect(state.players.p1.vehicle.mode).not.toBe('docked')
    expect(toCanonical(state.players.p1.wallet)).not.toBe('0')
    const text = slotTextOf(state)
    expect(resavedTextOf(text)).toBe(text)
  })

  it('writes the same bytes again for the planet-200 dive saved mid-cut', () => {
    const state = diveMidCut()
    expect(state.planet.index).toBe(200)
    const text = slotTextOf(state)
    expect(resavedTextOf(text)).toBe(text)
  })

  it('keeps writing the same bytes over a second load and save', () => {
    const text = slotTextOf(planet1MidRun())
    expect(resavedTextOf(resavedTextOf(text))).toBe(text)
  })
})
