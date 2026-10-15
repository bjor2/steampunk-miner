import { describe, expect, it } from 'vitest'
import type { DrillLadderRung } from '../systems/authority/drillLadder'
import { drillPowerAtStep } from '../systems/economy/vehicleStats'
import { toFixedText } from '../systems/money'
import {
  formatLadderTable,
  ladderHistoryRowsOf,
  ladderNdjsonOf,
  ladderRowsOf,
  ladderStepsOf,
  type LadderSetup,
} from './drillLadderReport'

const SETUP: LadderSetup = {
  ladder: 'drill-ladder',
  planet: 1,
  worldSeed: 1,
  column: 20,
  cells: 60,
}

/** A rung cutting 60 cells in `ticks` ticks at drill level `level`. */
const rung = (level: number, ticks: number): DrillLadderRung => ({ level, cells: 60, ticks })

describe('drill ladder report (ticket 409)', () => {
  it('reads seconds and cells/s from the ticks a column took', () => {
    const [row] = ladderRowsOf([rung(1, 90)])
    expect(row).toMatchObject({ seconds: '1.500', cellsPerSecond: '40.000', gainOnPrevious: null })
  })

  it("gives each step the drill law's gain, 1.12 compounded over the levels it climbs", () => {
    const [step] = ladderStepsOf([rung(1, 1000), rung(5, 600)])
    expect(toFixedText(step.lawGain, 6)).toBe('1.573519')
  })

  it("passes a step that keeps the law's gain", () => {
    const [step] = ladderStepsOf([rung(1, 1574), rung(5, 1000)])
    expect(step).toMatchObject({ from: 1, to: 5, isFaster: true, isClearlyFelt: true })
  })

  it("fails a step that is faster by less than the law's gain less 5%", () => {
    // 1.12^4 * 0.95 = 1.4948: 1495 ticks to 1000 keeps it, 1000 to 671 (1.490) falls short.
    const [kept, short] = ladderStepsOf([rung(1, 1495), rung(5, 1000), rung(9, 671)])
    expect(kept.isClearlyFelt).toBe(true)
    expect(short).toMatchObject({ isFaster: true, isClearlyFelt: false })
  })

  it('fails a step that cuts no faster than the level below it', () => {
    const [step] = ladderStepsOf([rung(10, 500), rung(15, 500)])
    expect(step).toMatchObject({ isFaster: false, isClearlyFelt: false })
  })

  it('prints a row a level under the table head', () => {
    const table = formatLadderTable(SETUP, [rung(1, 1574), rung(5, 1000)])
    expect(table.split('\n')).toHaveLength(5)
    expect(table).toContain('| 5 | 1000 | 16.667 | 3.600 | 1.574 | 1.574 |')
  })

  it('logs the setup, then one line a level', () => {
    const lines = ladderNdjsonOf(SETUP, [rung(1, 1574), rung(5, 1000)])
      .trimEnd()
      .split('\n')
    expect(lines.map((text) => JSON.parse(text) as object)).toEqual([
      SETUP,
      expect.objectContaining({ level: 1, ticks: 1574, gainOnPrevious: null }),
      expect.objectContaining({ level: 5, ticks: 1000, gainOnPrevious: '1.574' }),
    ])
  })
})

describe('drill ladder history rows (ticket 434)', () => {
  const MEASURED_AT = '2026-10-16T01:35:00.000Z'

  it("counts the law in stored steps when the rungs are steps: ten of them are one major's 1.12", () => {
    const [step] = ladderStepsOf([rung(10, 1120), rung(20, 1000)], drillPowerAtStep)
    expect(toFixedText(step.lawGain, 3)).toBe('1.120')
  })

  it('stamps every level of one run with the run, the ground and the level cut before it', () => {
    const rows = ladderHistoryRowsOf(
      SETUP,
      [rung(1, 90), rung(5, 60)],
      drillPowerAtStep,
      MEASURED_AT,
    )
    expect(rows).toEqual([
      expect.objectContaining({
        schema: 1,
        id: `${MEASURED_AT}-drill-ladder-L1`,
        measuredAt: MEASURED_AT,
        ladder: 'drill-ladder',
        worldSeed: 1,
        level: 1,
        previousLevel: null,
        cellsPerSecond: '40.000',
        lawGainOnPrevious: null,
      }),
      expect.objectContaining({
        id: `${MEASURED_AT}-drill-ladder-L5`,
        level: 5,
        previousLevel: 1,
        cellsPerSecond: '60.000',
        gainOnPrevious: '1.500',
      }),
    ])
  })
})
