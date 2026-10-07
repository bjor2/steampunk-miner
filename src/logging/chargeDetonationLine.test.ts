import { describe, expect, it } from 'vitest'
import { readChargeDetonation } from './chargeDetonationLine'
import { LOG_SCHEMA_VERSION } from './runEvent'
import { runEventProblems } from './runEventSchema'

/** A `charge_detonated` line as the game logged it before the dynamite sizes (K6 #189). */
const olderLine = {
  v: LOG_SCHEMA_VERSION,
  seq: 88,
  tick: 900,
  timestamp: 15,
  runId: 'run_2026-10-06_20-30-15',
  playerId: 'p1',
  planet: 7,
  depthTiles: 40,
  event: 'charge_detonated',
  data: { tx: 3, ty: -41 },
}

describe('charge detonation line', () => {
  it('still accepts a line logged before detonations carried their size', () => {
    expect(runEventProblems(olderLine)).toEqual([])
  })

  it('reads a line logged before the dynamite sizes as the shipped charge, size 1', () => {
    expect(readChargeDetonation(olderLine.data)).toEqual({ tx: 3, ty: -41, size: 1 })
  })

  it('reads the size and radius a line carries', () => {
    const data = { tx: 3, ty: -41, size: 10, radiusMm: 24000 }
    expect(readChargeDetonation(data)).toEqual(data)
  })

  it('refuses a radius that is not a whole number of millimetres', () => {
    const line = { ...olderLine, data: { tx: 3, ty: -41, size: 1, radiusMm: 2500.5 } }
    expect(runEventProblems(line)).toEqual([
      'charge_detonated.radiusMm must be a safe integer, got 2500.5',
    ])
  })
})
