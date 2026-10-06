import { describe, expect, it } from 'vitest'
import type { RunEventData, RunEventName } from './eventNames'
import type { PacingReport } from './pacingReport'
import { formatRefineGain, refineGainByPlanet, refineryLeverFindings } from './refineryReport'
import type { RunEvent } from './runEvent'
import { deriveSummary } from './runSummary'

const MINUTE = 60 * 60

function line<N extends RunEventName>(event: N, data: RunEventData<N>, planet: number): RunEvent {
  return {
    v: 1,
    seq: 0,
    tick: 0,
    timestamp: 0,
    runId: 'run_test',
    playerId: 'p1',
    planet,
    depthTiles: 0,
    event,
    data,
  } as RunEvent
}

const collected = (planet: number, units: number, rawValue: string, value: string) =>
  line(
    'refine_collected',
    { slot: 0, tier: 7, units, rawValue, value, waitSeconds: 240, queuedPlanet: planet },
    planet,
  )

/** Only the per-planet core times matter to the lever rule. */
const paced = (coreMinutesOnPlanet: Record<string, number>) =>
  ({
    coreTicksOnPlanet: Object.fromEntries(
      Object.entries(coreMinutesOnPlanet).map(([planet, minutes]) => [planet, minutes * MINUTE]),
    ),
  }) as unknown as PacingReport

describe('refinery report', () => {
  it('sums the realised refine gain per planet the batches were collected on', () => {
    const events = [
      collected(3, 5, '100', '125'),
      collected(3, 4, '80', '100'),
      collected(4, 5, '300', '375'),
    ]
    expect(refineGainByPlanet(events)).toEqual({
      '3': { batches: 2, units: 9, rawValue: '1.8e+2', value: '2.25e+2', gain: '4.5e+1' },
      '4': { batches: 1, units: 5, rawValue: '3e+2', value: '3.75e+2', gain: '7.5e+1' },
    })
    expect(formatRefineGain(refineGainByPlanet(events))).toContain('| 3 | 2 | 9 |')
  })

  it('counts a collected batch as money earned in the run summary', () => {
    expect(deriveSummary([collected(3, 5, '100', '125')]).moneyEarned).toBe('1.25e+2')
  })

  it('finds a planet the refinery pushes below 45 minutes', () => {
    expect(refineryLeverFindings(paced({ '3': 44 }), paced({ '3': 47 }))).toEqual([
      'planet 3 drops below 45 min: 44.0 min refining against 47.0 min without',
    ])
  })

  it('finds a planet the refinery shortens by more than 10%', () => {
    expect(refineryLeverFindings(paced({ '4': 53 }), paced({ '4': 60 }))).toEqual([
      'planet 4 is more than 10% shorter: 53.0 min refining against 60.0 min without',
    ])
  })

  it('finds nothing within the rule, or where one run did not finish the planet', () => {
    expect(
      refineryLeverFindings(paced({ '3': 50, '4': 57 }), paced({ '3': 52, '4': 60, '5': 55 })),
    ).toEqual([])
  })
})
