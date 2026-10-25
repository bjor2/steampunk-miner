import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../authority/authorityState'
import type { LiveBlast } from '../authority/charges/liveBlast'
import { blastAt, liveBlastSession, SOLID_SITE } from '../authority/charges/liveBlastFixtures'
import { continueScriptedSession, createScriptedSession } from '../authority/scriptedSession'
import { takeSnapshot } from '../authority/sessionSnapshot'
import { readMigratedSaveSlot } from './saveMigrations'
import { saveSlotOf } from './saveSlot'

/** The session as snapshot 28 held it: its live blasts with no level, no number, no counter. */
function beforeTheDiscRecord(state: AuthorityState): AuthorityState {
  const liveBlasts = state.liveBlasts.map(({ blast, ...live }) => {
    const { radiusLevel: _level, blastSeq: _seq, ...unnumbered } = blast
    return { ...live, blast: unnumbered } as unknown as LiveBlast
  })
  const { blastSeq: _counter, ...rest } = state
  return { ...rest, liveBlasts }
}

function migratedState(state: AuthorityState): AuthorityState {
  const file = saveSlotOf({ ...takeSnapshot(beforeTheDiscRecord(state)), snapshotVersion: 28 }, 1)
  const reading = readMigratedSaveSlot(JSON.parse(JSON.stringify(file)))
  if (!('state' in reading)) throw new Error(reading.problems.join('; '))
  expect(reading.migrations).toEqual([{ version: 'snapshotVersion', from: 28, to: 29 }])
  return reading.state
}

/** Two blasts saved mid-crater, five ticks after they went live. */
function midCrater(): AuthorityState {
  const session = liveBlastSession(
    [
      blastAt(SOLID_SITE, 13_000, { size: 7 }),
      blastAt({ tx: SOLID_SITE.tx + 30, ty: SOLID_SITE.ty }, 6_000, { size: 4, playerId: 'p2' }),
    ],
    ['p1', 'p2'],
  )
  session.advanceTo(5)
  return session.state()
}

describe('save migration: snapshot 28 -> 29, the blast disc record (ticket 860)', () => {
  it('numbers the live blasts of an old save in the order they went live, at level 0, the counter past them', () => {
    const state = migratedState(midCrater())
    expect(state.liveBlasts.map(({ blast }) => [blast.blastSeq, blast.radiusLevel])).toEqual([
      [0, 0],
      [1, 0],
    ])
    expect(state.blastSeq).toBe(2)
  })

  it('finishes the craters an old save held as they would have finished', () => {
    const saved = midCrater()
    const migrated = continueScriptedSession(migratedState(saved))
    const unsaved = continueScriptedSession(saved)
    migrated.advanceTo(60)
    unsaved.advanceTo(60)
    expect(migrated.state().world).toEqual(unsaved.state().world)
    expect(migrated.state().liveBlasts).toEqual([])
  })

  it('keeps an old save with no live blast as saved, its owned sizes the same rows of the ladder', () => {
    const session = createScriptedSession()
    session.submit(0, { type: 'debug.setCharges', payload: { size: 10, carried: 1, slotLevel: 5 } })
    const state = session.state()
    expect(migratedState(state)).toEqual(state)
    expect(migratedState(state).players.p1.vehicle.charges.carriedBySize).toEqual({ '10': 1 })
  })
})
