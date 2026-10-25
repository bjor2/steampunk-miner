import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../authority/authorityState'
import { continueScriptedSession, createScriptedSession } from '../authority/scriptedSession'
import { takeSnapshot } from '../authority/sessionSnapshot'
import { stateDigest } from '../authority/stateDigest'
import PLANET_1_SAVE from './fixtures/pre-175-planet-1.save.json'
import { readMigratedSaveSlot } from './saveMigrations'
import { readSaveSlot, saveSlotOf } from './saveSlot'

const throughJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const setMoney = { type: 'debug.setMoney', payload: { amount: '1e9' } } as const
const dock = { type: 'dock', payload: { bay: 'sell' } } as const
const buyFuel = { type: 'buyFuel', payload: { units: 5 } } as const
const jumpTo = (planet: string) =>
  ({ type: 'jumpToPlanet', payload: { system: '1', planet } }) as const

function restoredState(file: unknown): AuthorityState {
  const reading = readMigratedSaveSlot(file)
  if (!('state' in reading)) throw new Error(reading.problems.join('; '))
  return reading.state
}

/** The pre-#175 fixture's one player. */
const PLAYER = 'player_1'

/** From `start`, docked with money: a neighbour hop to planet 2, then one back to planet 1. */
function jumpAwayAndBack(start: AuthorityState) {
  const session = continueScriptedSession(start)
  const tick = start.tick
  session.submit(tick, setMoney, PLAYER)
  session.submit(tick, dock, PLAYER)
  session.submit(tick + 1, buyFuel, PLAYER)
  session.submit(tick + 2, jumpTo('2'), PLAYER)
  const away = session.state()
  session.submit(tick + 3, buyFuel, PLAYER)
  session.submit(tick + 4, jumpTo('1'), PLAYER)
  return { away, back: session.state() }
}

describe('save migration: snapshot 24 -> 25, the core bay of each planet (ticket 790)', () => {
  it('reads an old save single bay as the bay of the planet it was saved on', () => {
    const state = restoredState(PLANET_1_SAVE)
    expect(state.planet.index).toBe(1)
    expect(state.platform.coreBay).toBe(PLANET_1_SAVE.world.platform.coreBay)
    expect('awayCoreBays' in state.platform).toBe(false)
  })

  it('stows the old save bay under its planet s:p when the session jumps away, and gives it back on return', () => {
    const saved = PLANET_1_SAVE.world.platform.coreBay
    const { away, back } = jumpAwayAndBack(restoredState(PLANET_1_SAVE))
    expect(away.platform.coreBay).toBe(0)
    expect(away.platform.awayCoreBays).toEqual({ '1:1': { fragments: saved, isCompleted: false } })
    expect(back.platform.coreBay).toBe(saved)
    expect('awayCoreBays' in back.platform).toBe(false)
  })

  it('loads a snapshot 24 save through its step and the later steps with its state and digest as saved', () => {
    const state = createScriptedSession().state()
    const file = saveSlotOf({ ...takeSnapshot(state), snapshotVersion: 24 }, 1)
    const reading = readMigratedSaveSlot(file)
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    expect(reading.migrations).toEqual([
      { version: 'snapshotVersion', from: 24, to: 25 },
      { version: 'snapshotVersion', from: 25, to: 26 },
      { version: 'snapshotVersion', from: 26, to: 27 },
      { version: 'snapshotVersion', from: 27, to: 28 },
      { version: 'snapshotVersion', from: 28, to: 29 },
    ])
    expect(reading.state).toEqual(state)
    expect(stateDigest(reading.state)).toBe(stateDigest(state))
  })

  it('keeps the left planets bays through save and load', () => {
    const { away } = jumpAwayAndBack(restoredState(PLANET_1_SAVE))
    const reading = readSaveSlot(throughJson(saveSlotOf(takeSnapshot(away), 1)))
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    expect(reading.state).toEqual(away)
  })
})
