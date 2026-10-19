import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../systems/authority/authorityState'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { createScriptedSession } from '../systems/authority/scriptedSession'
import { drillPower } from '../systems/economy/vehicleStats'
import { fromCanonical, toFixedText } from '../systems/money'
import {
  amberIncomeGainsOf,
  averageFeltOf,
  emptyDrillPaceTally,
  feltCellsPerSecond,
  incomeGainsOf,
  longestGapMinutesOf,
  planetMinutesOf,
  tallyDrillPaceStep,
  type DrillPaceTally,
  type PlanetDrillPace,
} from './drillPace'
import {
  gatedDrillPaceProblemsOf,
  printedDrillPaceFindingsOf,
  spendShareBpOf,
  type DrillPaceRun,
} from './drillPaceBars'

const MINUTE = 3600

/** The scripted session's state at `tick` with drill power `drill`, on planet `planet`. */
function stateWith(tick: number, drill: number, planet = 1): AuthorityState {
  const session = createScriptedSession()
  session.submit(0, {
    type: 'debug.setUpgrade',
    payload: { upgradeId: 'drill_power', level: drill },
  })
  const state = session.state()
  return { ...state, tick, planet: { ...state.planet, index: planet } }
}

const drillBought = (toLevel: number, cost = '20'): DomainEvent =>
  ({
    type: 'UpgradePurchased',
    upgradeId: 'drill_power',
    toLevel,
    fromLevel: toLevel - 1,
    isMajor: false,
    cost,
  }) as DomainEvent

const bought = (upgradeId: string, cost: string, isMajor = false): DomainEvent =>
  ({
    type: 'UpgradePurchased',
    upgradeId,
    toLevel: 1,
    fromLevel: 0,
    isMajor,
    cost,
  }) as DomainEvent

const sold = (value: string): DomainEvent => ({ type: 'ResourceSold', value }) as DomainEvent
const CORE: DomainEvent = { type: 'CoreCompleted', durationTicks: 0 } as DomainEvent
const DRY: DomainEvent = { type: 'EnergyDepleted' } as DomainEvent

function step(tally: DrillPaceTally, state: AuthorityState, events: DomainEvent[] = []): void {
  tallyDrillPaceStep(tally, state, 'p1', events)
}

/** A planet's pace as a run folds it, with the fields a bar reads. */
function paceOf(planet: number, over: Partial<PlanetDrillPace>): PlanetDrillPace {
  return {
    planet,
    arrivalTick: 0,
    coreTick: 25 * MINUTE,
    drillPurchases: 3,
    feltTicks: 10 * 25 * MINUTE,
    heldTicks: 25 * MINUTE,
    coreFelt: 12,
    longestGapTicks: 8 * MINUTE,
    majors: 4,
    drillTipMajors: 6,
    catchUpPurchases: 3,
    trackSpend: { drill_power: fromCanonical('970'), cargo_hold: fromCanonical('30') },
    tankEmpties: 0,
    ...over,
  }
}

function runOf(worldSeed: number, paces: PlanetDrillPace[]): DrillPaceRun {
  const tally = emptyDrillPaceTally()
  paces.forEach((pace) => tally.planets.set(pace.planet, pace))
  return { worldSeed, tally }
}

const TEN_PLANETS = (over: (planet: number) => Partial<PlanetDrillPace> = () => ({})) =>
  Array.from({ length: 10 }, (_, at) => paceOf(at + 1, over(at + 1)))

describe('drill pace of a bot run (#551, ticket 552)', () => {
  it("counts a planet's minutes from arrival to its core and the drill purchases bought on it", () => {
    const tally = emptyDrillPaceTally()
    step(tally, stateWith(0, 1))
    step(tally, stateWith(5 * MINUTE, 2), [drillBought(2)])
    step(tally, stateWith(26 * MINUTE, 2), [CORE])
    const pace = tally.planets.get(1)!
    expect([planetMinutesOf(pace), pace.drillPurchases]).toEqual([26, 1])
  })

  it('weights the felt speed by the ticks each drill was held, up to the core', () => {
    const tally = emptyDrillPaceTally()
    step(tally, stateWith(0, 1))
    step(tally, stateWith(MINUTE, 2), [drillBought(2)])
    step(tally, stateWith(4 * MINUTE, 2), [CORE])
    step(tally, stateWith(9 * MINUTE, 2))
    const expected =
      (feltCellsPerSecond({ ...levelsOf(1) }, 1) + 3 * feltCellsPerSecond(levelsOf(2), 1)) / 4
    expect(averageFeltOf(tally.planets.get(1)!)).toBeCloseTo(expected, 9)
    expect(tally.planets.get(1)!.coreFelt).toBe(feltCellsPerSecond(levelsOf(2), 1))
  })

  it('logs each drill purchase as n, D, price, planet, minute and the income a hour of the level it replaced', () => {
    const tally = emptyDrillPaceTally()
    step(tally, stateWith(0, 1))
    step(tally, stateWith(30 * MINUTE, 1), [sold('500')])
    step(tally, stateWith(60 * MINUTE, 2), [drillBought(2, '30')])
    expect(tally.purchases).toEqual([
      {
        n: 2,
        d: toFixedText(drillPower(2), 3),
        price: '30',
        planet: 1,
        minute: '60.0',
        incomePerHour: '500.000',
        isOnePlanetInterval: true,
      },
    ])
  })

  it('takes the longest wait between two drill purchases on the planet of the later one', () => {
    const tally = emptyDrillPaceTally()
    step(tally, stateWith(0, 1))
    step(tally, stateWith(2 * MINUTE, 2), [drillBought(2)])
    step(tally, stateWith(9 * MINUTE, 3), [drillBought(3)])
    step(tally, stateWith(12 * MINUTE, 4), [drillBought(4)])
    expect(longestGapMinutesOf(tally.planets.get(1)!)).toBe(7)
  })

  it('counts the tank running dry on the planet it ran dry on', () => {
    const tally = emptyDrillPaceTally()
    step(tally, stateWith(0, 1, 3), [DRY])
    expect(tally.planets.get(3)?.tankEmpties).toBe(1)
  })

  it('compares income only between purchases on one planet, amber at the second gain under +5%', () => {
    const rows = ['100', '110', '112', '113', '200'].map((income, at) => ({
      n: at + 2,
      d: '1',
      price: '1',
      planet: at < 4 ? 1 : 2,
      minute: '0',
      incomePerHour: income,
      isOnePlanetInterval: at !== 4,
    }))
    const gains = incomeGainsOf(rows)
    expect(gains.map(({ n, gain }) => [n, toFixedText(gain, 3)])).toEqual([
      [2, '0.100'],
      [3, '0.018'],
      [4, '0.009'],
    ])
    expect(amberIncomeGainsOf(gains).map(({ n }) => n)).toEqual([4])
  })

  // Ticket 553: the cadence basis is drill + tip (GD amendment 2 on #551), the burst counts hold,
  // boiler and engine purchases (Systems' B4), and the spend share reads every track's spend.
  it('counts drill purchases and tip majors for the cadence, and hold, boiler and engine purchases', () => {
    const tally = emptyDrillPaceTally()
    step(tally, stateWith(0, 1), [
      drillBought(2),
      bought('drill_tip', '5'),
      bought('drill_tip', '50', true),
      bought('cargo_hold', '3'),
      bought('boiler', '3'),
      bought('engine', '4'),
      bought('hull', '46', true),
    ])
    const pace = tally.planets.get(1)!
    expect([pace.drillTipMajors, pace.catchUpPurchases, pace.majors]).toEqual([2, 3, 3])
  })

  it('shares the track spend out in whole basis points, with and without the hull', () => {
    const tally = emptyDrillPaceTally()
    step(tally, stateWith(0, 1), [
      drillBought(2, '800'),
      bought('cargo_hold', '60'),
      bought('engine', '40'),
      bought('hull', '100'),
    ])
    const pace = tally.planets.get(1)!
    expect(spendShareBpOf(pace, ['cargo_hold', 'boiler', 'engine'])).toBe(1000)
    expect(spendShareBpOf(pace, ['cargo_hold', 'boiler', 'engine', 'hull'])).toBe(2000)
  })
})

describe('drill pace bars on the seed median (#551 point 5, ticket 552)', () => {
  const seeds = (paces: () => PlanetDrillPace[]) => [11, 22, 33].map((seed) => runOf(seed, paces()))

  it('passes ten planets of 25 minutes, 8-minute gaps and 10 felt cells/s', () => {
    expect(gatedDrillPaceProblemsOf(seeds(() => TEN_PLANETS()))).toEqual([])
  })

  it('gates a planet over 30 minutes, a gap over 10, felt under 5, a dry tank and a stalled core', () => {
    const runs = seeds(() =>
      TEN_PLANETS((planet) =>
        planet === 3
          ? {
              coreTick: 31 * MINUTE,
              longestGapTicks: 11 * MINUTE,
              feltTicks: 4 * 25 * MINUTE,
              heldTicks: 25 * MINUTE,
              tankEmpties: 1,
            }
          : planet === 10
            ? { coreTick: null }
            : {},
      ),
    )
    const problems = gatedDrillPaceProblemsOf(runs)
    expect(problems).toEqual([
      'planet 10 core never reached on the median seed (stalled)',
      'planet 3 takes 31.0 min, over 30',
      'planet 3 waits 11.0 min between two drill purchases, over 10',
      'planet 3 averages 4.00 felt cells/s, under 5',
      'seed 11 ran the tank dry 1x on planet 3',
      'seed 22 ran the tank dry 1x on planet 3',
      'seed 33 ran the tank dry 1x on planet 3',
    ])
  })

  it('prints a planet under 22 minutes and outside 3 to 4 purchases, never gating them', () => {
    const runs = seeds(() =>
      TEN_PLANETS((planet) => (planet === 5 ? { coreTick: 19 * MINUTE, drillPurchases: 6 } : {})),
    )
    expect(gatedDrillPaceProblemsOf(runs)).toEqual([])
    expect(printedDrillPaceFindingsOf(runs)).toEqual(
      expect.arrayContaining([
        'planet 5 takes 19.0 min, under 22 (printed until #559)',
        'planet 5 buys 6 drill purchases, outside 3 to 4',
      ]),
    )
  })
})

describe('drill pace bars of ticket 553, printed', () => {
  const seeds = (paces: () => PlanetDrillPace[]) => [11, 22, 33].map((seed) => runOf(seed, paces()))

  it('prints drill + tip majors outside 3.5 to 7.0, and amber at 7', () => {
    const runs = seeds(() =>
      TEN_PLANETS((planet) => ({ drillTipMajors: planet === 4 ? 7 : planet === 6 ? 8 : 6 })),
    )
    expect(printedDrillPaceFindingsOf(runs)).toEqual(
      expect.arrayContaining([
        'planet 4 amber: 7 drill + tip majors',
        'planet 6 lands 8 drill + tip majors, outside 3.5 to 7.0',
      ]),
    )
    expect(gatedDrillPaceProblemsOf(runs)).toEqual([])
  })

  it('prints hold, boiler and engine spend past 6% from P2 and 15% on P1, with the hull beside it', () => {
    const heavy = { drill_power: fromCanonical('900'), engine: fromCanonical('100') }
    const runs = seeds(() =>
      TEN_PLANETS((planet) => (planet === 1 || planet === 5 ? { trackSpend: heavy } : {})),
    )
    const findings = printedDrillPaceFindingsOf(runs)
    expect(findings).toContain(
      'planet 5 spends 1000 bp on hold, boiler and engine (1000 bp with the hull), bar 600 bp',
    )
    expect(findings.filter((line) => line.startsWith('planet 1 spends'))).toEqual([])
  })

  it('prints a catch-up burst over 50 hold, boiler and engine purchases', () => {
    const runs = seeds(() => TEN_PLANETS((planet) => ({ catchUpPurchases: planet === 1 ? 51 : 3 })))
    expect(printedDrillPaceFindingsOf(runs)).toContain(
      'planet 1 buys 51 hold, boiler and engine steps, over 50',
    )
  })
})

function levelsOf(drill: number) {
  return { drill_power: drill, drill_tip: 0, engine: 0, boiler: 0, cargo_hold: 0, hull: 0 }
}
