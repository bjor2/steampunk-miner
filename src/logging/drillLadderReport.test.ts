import { describe, expect, it } from 'vitest'
import type { DrillLadderRung } from '../systems/authority/drillLadder'
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

  it("gives each step the drill law's gain, 1.243 compounded over the purchases it climbs", () => {
    const [step] = ladderStepsOf([rung(1, 1000), rung(5, 600)])
    expect(toFixedText(step.lawGain, 6)).toBe('2.387176')
  })

  it("passes a step that keeps the law's gain", () => {
    const [step] = ladderStepsOf([rung(1, 2387), rung(5, 1000)])
    expect(step).toMatchObject({ from: 1, to: 5, isFaster: true, isInPurchaseBand: true })
  })

  it('fails a step that gains under 1.181 or over 1.305 a purchase, compounded (#552)', () => {
    // 1.181^2 = 1.3948 and 1.305^2 = 1.7030 over two purchases.
    const steps = ladderStepsOf([rung(1, 1394), rung(3, 1000), rung(5, 700), rung(7, 411)])
    expect(steps.map(({ isInPurchaseBand }) => isInPurchaseBand)).toEqual([false, true, false])
  })

  it('fails a step that cuts no faster than the level below it', () => {
    const [step] = ladderStepsOf([rung(10, 500), rung(15, 500)])
    expect(step).toMatchObject({ isFaster: false, isInPurchaseBand: false })
  })

  it('prints a row a level under the table head', () => {
    const table = formatLadderTable(SETUP, [rung(1, 2387), rung(5, 1000)])
    expect(table.split('\n')).toHaveLength(5)
    expect(table).toContain('| 5 | 1000 | 16.667 | 3.600 | 2.387 | 2.387 |')
  })

  it('logs the setup, then one line a level', () => {
    const lines = ladderNdjsonOf(SETUP, [rung(1, 2387), rung(5, 1000)])
      .trimEnd()
      .split('\n')
    expect(lines.map((text) => JSON.parse(text) as object)).toEqual([
      SETUP,
      expect.objectContaining({ level: 1, ticks: 2387, gainOnPrevious: null }),
      expect.objectContaining({ level: 5, ticks: 1000, gainOnPrevious: '2.387' }),
    ])
  })
})

describe('drill ladder history rows (ticket 434)', () => {
  const MEASURED_AT = '2026-10-16T01:35:00.000Z'

  it('counts the law in stored steps, one purchase each (#552)', () => {
    const [step] = ladderStepsOf([rung(10, 1243), rung(11, 1000)])
    expect(toFixedText(step.lawGain, 3)).toBe('1.243')
  })

  it('stamps every level of one run with the run, the ground and the level cut before it', () => {
    const rows = ladderHistoryRowsOf(SETUP, [rung(1, 90), rung(5, 60)], MEASURED_AT)
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
