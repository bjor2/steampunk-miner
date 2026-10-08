import { describe, expect, it } from 'vitest'
import { setVehicleLoadoutCommand } from '../authority/loadoutCommands'
import { createScriptedSession, mineTile, surfaceOreTiles } from '../authority/scriptedSession'
import { minedSequenceOf, noFreeCellRunsOn } from './noFreeCellRuns'

// The no-free-cell harness's own seams (ticket 323); its bot runs are the long specs that use it.

describe('no-free-cell runs', () => {
  it('traces each cell dug and each ore unit banked, with its tick, in order', () => {
    const session = createScriptedSession()
    const [ore] = surfaceOreTiles(1)
    const events = mineTile(session, 10, ore)
    const mined = minedSequenceOf(events)
    expect(mined.length).toBeGreaterThanOrEqual(2)
    expect(mined).toContainEqual({ tick: 50, tx: ore.tx, ty: ore.ty, kind: 'ore' })
    expect(mined.some((step) => 'oreId' in step && step.tick === 50)).toBe(true)
  })

  it('refuses setups that would stamp different seqs on the two runs', () => {
    const uneven = { bare: [], owned: [setVehicleLoadoutCommand({}, ['combo.example'])] }
    expect(() => noFreeCellRunsOn(7, uneven)).toThrow(/as many commands/)
  })
})
