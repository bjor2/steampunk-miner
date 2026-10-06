import { describe, expect, it } from 'vitest'
import type { RunEventData, RunEventName } from './eventNames'
import { formatHeatPlanetLines, heatPlanetLines } from './heatReport'
import type { PacingReport } from './pacingReport'
import type { RunEvent } from './runEvent'

const MINUTE = 60 * 60

function line<N extends RunEventName>(
  event: N,
  data: RunEventData<N>,
  planet: number,
  tick: number,
): RunEvent {
  return {
    v: 1,
    seq: 0,
    tick,
    timestamp: 0,
    runId: 'run_test',
    playerId: 'p1',
    planet,
    depthTiles: 0,
    event,
    data,
  } as RunEvent
}

const paced = (coreMinutesOnPlanet: Record<string, number>) =>
  ({
    coreTicksOnPlanet: Object.fromEntries(
      Object.entries(coreMinutesOnPlanet).map(([planet, minutes]) => [planet, minutes * MINUTE]),
    ),
  }) as unknown as PacingReport

const arrivedAt = (planet: number, tick: number) =>
  line('planet_entered', { planetSeed: 1, generatorVersion: 5, radius: 676 }, planet, tick)
const lined = (planet: number, type: string) =>
  line('casing_lined', { lengthMm: 500, band: 4, grade: 4, type, price: '1', paid: '1' }, planet, 0)

describe('heat report (#113 acceptance 4)', () => {
  const events = [
    arrivedAt(8, 100 * MINUTE),
    line('lining_type_unlocked', { type: 'refractory', price: '9' }, 8, 112 * MINUTE),
    lined(8, 'refractory'),
    lined(8, 'refractory'),
    lined(8, 'standard'),
    line('overheat_started', {}, 8, 0),
    line(
      'vehicle_damaged',
      {
        amount: '1',
        source: 'heat',
        arc: 'none',
        enemyId: '',
        kind: 'none',
        tier: 0,
        hullAfter: '9',
      },
      8,
      0,
    ),
    line('lava_contact', { tx: 1, ty: 2 }, 8, 0),
    line('lava_blocked', { ring: '1500,2500' }, 8, 0),
    arrivedAt(9, 160 * MINUTE),
  ]

  it('derives the unlock, the refractory laid and what heat and lava did, planet by planet', () => {
    const [eight, nine] = heatPlanetLines(events, paced({ '8': 52, '9': 70 }), [8, 9])
    expect(eight).toEqual({
      planet: 8,
      coreMinutes: 52,
      isInCampaignTarget: true,
      refractoryUnlockedMinutes: 12,
      refractoryMetres: 1,
      overheats: 1,
      heatDamageHits: 1,
      lavaTouches: 1,
      lavaBlocked: 1,
    })
    expect(nine).toMatchObject({ coreMinutes: 70, isInCampaignTarget: false, overheats: 0 })
  })

  it('says a planet the run never finished was not reached', () => {
    const [ten] = heatPlanetLines(events, paced({}), [10])
    expect(formatHeatPlanetLines([ten])).toContain('| 10 | - | not reached |')
  })
})
