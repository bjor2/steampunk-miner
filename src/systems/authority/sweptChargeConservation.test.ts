import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { withRegistrations } from '../../registries/registrar'
import type { GateVerdict } from '../registries/gateChecks'
import { cargoUnitsOf, statsOfVehicle } from '../vehicle/vehicleState'
import type { TilePoint } from '../world/tileGrid'
import { vehicleOf } from './authorityState'
import type { DomainEventBody } from './domainEvent'
import {
  CHARGE_LEGS,
  CHARGE_RIGS,
  chargedLegOf,
  chargedWindowOf,
  chargeRowLineOf,
  CRAWL_RIG,
  legChargeOf,
  OVER_CHARGE_BOUND,
  overChargeOf,
  unconservedTicksOf,
  type ChargePhase,
  type TickCharge,
} from './sweptChargeFixtures'
import { columnLeg, COLUMN_LEG, rigAt, TILTED_LEG } from './sweptRigFixtures'

// Work charged equals work spent at every stop (ticket 466, VS's line as the GD counted it by tick
// in 6209400700 Q1 (c)): the swept ledger, charging the carry the release clamp keeps (fix A),
// charges a leg's paid prices, its final carry and the carried-in work later ticks drop, to the
// sub-step after every tick, and over-charges no row by more than 8% (the VS bar). The ledger is
// not in the loop until #441's ring re-run, so the legs run through the carve's recorder
// (`sweptChargeFixtures.ts`); the residual is printed per row. Every tick phase and start offset
// the TD measured runs in `sweptChargeConservation.lane.test.ts`.

/** Two of the TD's tick phases and start offsets; the lane runs all twelve. */
const PHASES: readonly ChargePhase[] = [
  { startTick: 1, offsetMm: 0 },
  { startTick: 19, offsetMm: 41 },
]

/** From here up a tick never drops carried-in work, so it charges exactly what it spends. */
const EXACT_FROM_M_PER_S = 78

const rows: string[] = []

afterAll(() => {
  console.log(`swept charge conservation (ticket 466)\n${rows.join('\n')}`)
})

describe('swept ledger charges the work it spends (ticket 466)', () => {
  for (const phase of PHASES) {
    for (const { name, leg } of CHARGE_LEGS) {
      for (const rig of CHARGE_RIGS) {
        const label = `${name} at ${rig.speed} m/s, tick ${phase.startTick}, start +${phase.offsetMm} mm`
        it(`charges the paid prices, the carry kept and the carried-in work dropped after every tick, ${label}`, () => {
          const { charges } = chargedWindowOf(rig, leg, phase)
          const charge = legChargeOf(charges)
          rows.push(chargeRowLineOf(label, charge))
          expect(charges.length).toBeGreaterThan(2)
          expect(unconservedTicksOf(charges)).toEqual([])
          expect(overChargeOf(charge)).toBeLessThanOrEqual(OVER_CHARGE_BOUND)
          if (rig.speed >= EXACT_FROM_M_PER_S) expect(charge.charged).toBe(charge.spent)
        })
      }
    }
  }
})

const REFUSED: GateVerdict = {
  outcome: 'refused',
  gateKind: 'probe',
  required: 'rig',
  have: 'none',
}

/** A slice refusing the listed cells, as a rig gate does. */
function refusingSliceOf(gated: readonly TilePoint[]): SliceDefinition {
  return {
    id: 'charge-probe',
    register: (r) =>
      r.gateCheck({
        id: 'charge-probe.listed',
        check: ({ tile }) => (gated.some((at) => isSameTile(at, tile)) ? REFUSED : null),
      }),
  }
}

function isSameTile(a: TilePoint, b: TilePoint): boolean {
  return a.tx === b.tx && a.ty === b.ty
}

function isGatedAt(event: DomainEventBody, tile: TilePoint): boolean {
  return event.type === 'DrillGated' && event.tx === tile.tx && event.ty === tile.ty
}

/** Planet 1's column 32, with an ore cell on its centre line 4 m down (`sweptFreshCarve.test.ts`). */
const STOP_LEG = columnLeg(32)
const STOP_GATE: TilePoint = { tx: 32, ty: 291 }

describe('swept ledger at a stop (ticket 466, Horizontal Scaler)', () => {
  for (const rig of [44, 240, 3600].map(rigAt)) {
    it(`keeps no carry at a gate, and the next tick carries in none, at ${rig.speed} m/s`, () => {
      const { run, charges } = withRegistrations([refusingSliceOf([STOP_GATE])], () =>
        chargedLegOf({ rig, leg: STOP_LEG, maxTicks: 12 }),
      )
      const gating = run.ticks.flatMap(({ events }, tick) =>
        events.some((event) => isGatedAt(event, STOP_GATE)) ? [tick] : [],
      )
      expect(charges).toHaveLength(run.ticks.length)
      expect(gating).toHaveLength(1)
      expect(charges.slice(gating[0]).map(({ kept }) => kept)).toEqual(
        charges.slice(gating[0]).map(() => 0),
      )
      expect(charges.slice(gating[0] + 1).every(({ carriedIn }) => carriedIn === 0)).toBe(true)
      expect(unconservedTicksOf(charges)).toEqual([])
    })
  }

  for (const rig of [CRAWL_RIG, ...[44, 240].map(rigAt)]) {
    it(`charges the work it spends once a full hold jams the walk, at ${rig.speed} m/s`, () => {
      const { run, charges } = chargedLegOf({
        rig,
        leg: COLUMN_LEG,
        maxTicks: 400,
        reachMm: 40_000,
        upgrades: { cargo_hold: 0 },
      })
      const vehicle = vehicleOf(run.ticks[run.ticks.length - 1].state, 'p1')
      expect(cargoUnitsOf(vehicle.cargo)).toBe(statsOfVehicle(vehicle).cargoCapacity)
      expect(unconservedTicksOf(charges)).toEqual([])
    })
  }
})

// Release and open ground are the legs' own stops: a released cell the stamp cut leaves less than
// the cursor carried in, and a cave the carry meets keeps none of it.
describe('swept ledger drops carried-in work only at a stop (ticket 466)', () => {
  let charges: TickCharge[] = []
  beforeAll(() => {
    charges = chargedWindowOf(CRAWL_RIG, TILTED_LEG, PHASES[0]).charges
  })

  it('carves again charging the clamped carry on the slow tilted leg', () => {
    expect(charges.some(({ walked, kept }) => kept < walked)).toBe(true)
  })

  it('drops carried-in work on the slow tilted leg, never more than it carried in', () => {
    const dropping = charges.filter(({ dropped }) => dropped > 0)
    expect(dropping.length).toBeGreaterThan(0)
    expect(dropping.every(({ dropped, carriedIn }) => dropped <= carriedIn)).toBe(true)
  })
})
