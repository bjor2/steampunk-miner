import { afterAll, describe, expect, it } from 'vitest'
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
  CRAWL_RIG,
  recordingChargesTick,
  recordingDebtTick,
  type ChargePhase,
} from './sweptChargeFixtures'
import { debtRowLineOf, inexactTicksOf, legDebtOf, openedCellsOf } from './sweptDebtFixtures'
import { columnLeg, COLUMN_LEG, rigAt, TILTED_LEG } from './sweptRigFixtures'

// Work charged equals work spent and owed after every tick (ticket 471's slice 1, ticket 503; the
// TD shape 6214473101 on #471 with the VS conditions 6214466718 and wording 6215265226): the swept
// ledger, paying the carry debt earlier ticks left, charges a leg's paid prices, the carry the
// cursor stores and the debt still owed, to the sub-step after every tick; the debt is never below
// 0 and is 0 from 78 m/s up. The ledger is dark until #441 wires it, so the legs run through the
// carve's recorder with the debt held there (`sweptChargeFixtures.ts`); each row's debt is printed,
// not pinned. Every tick phase and start offset the TD measured runs in the lane
// `sweptChargeExact.lane.test.ts`.

/** Two of the TD's tick phases and start offsets; the lane runs all twelve. */
const PHASES: readonly ChargePhase[] = [
  { startTick: 1, offsetMm: 0 },
  { startTick: 19, offsetMm: 41 },
]

/** From here up a tick never drops carried-in work, so it never owes (VS 6214466718). */
const DEBT_FREE_FROM_M_PER_S = 78

const rows: string[] = []

afterAll(() => {
  console.log(`swept charge with the carry debt (ticket 471)\n${rows.join('\n')}`)
})

describe('the swept ledger charges exactly what it spends (ticket 471)', () => {
  for (const phase of PHASES) {
    for (const { name, leg } of CHARGE_LEGS) {
      for (const rig of CHARGE_RIGS) {
        const label = `${name} at ${rig.speed} m/s, tick ${phase.startTick}, start +${phase.offsetMm} mm`
        it(`charges the paid prices, the kept carry and the debt owed after every tick, ${label}`, () => {
          const { charges } = chargedWindowOf(rig, leg, phase, recordingDebtTick)
          rows.push(debtRowLineOf(label, charges))
          expect(charges.length).toBeGreaterThan(2)
          expect(inexactTicksOf(charges)).toEqual([])
          expect(charges.filter(({ owes }) => owes < 0)).toEqual([])
        })
      }
    }
  }

  for (const phase of PHASES) {
    for (const { name, leg } of CHARGE_LEGS) {
      const rigs = CHARGE_RIGS.filter(({ speed }) => speed >= DEBT_FREE_FROM_M_PER_S)
      it(`ends a leg owing nothing from 78 m/s up, ${name}, tick ${phase.startTick}, start +${phase.offsetMm} mm`, () => {
        const owing = rigs.flatMap((rig) => {
          const debt = legDebtOf(chargedWindowOf(rig, leg, phase, recordingDebtTick).charges)
          return debt.final === 0 && debt.most === 0 ? [] : [{ speed: rig.speed, ...debt }]
        })
        expect(owing).toEqual([])
      })
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
    id: 'debt-probe',
    register: (r) =>
      r.gateCheck({
        id: 'debt-probe.listed',
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

describe('the swept ledger charges exactly what it spends at a stop (ticket 471)', () => {
  for (const rig of [44, 240, 3600].map(rigAt)) {
    it(`a gate leaves no carry station and the next tick owes nothing, at ${rig.speed} m/s`, () => {
      const { run, charges } = withRegistrations([refusingSliceOf([STOP_GATE])], () =>
        chargedLegOf({ rig, leg: STOP_LEG, maxTicks: 12 }, recordingDebtTick),
      )
      const gating = run.ticks.flatMap(({ events }, tick) =>
        events.some((event) => isGatedAt(event, STOP_GATE)) ? [tick] : [],
      )
      expect(charges).toHaveLength(run.ticks.length)
      expect(gating).toHaveLength(1)
      // Since ticket 570 the stamp meets the gate as it reaches the front's disc, a tick before the
      // walk can: the work of that tick is still the cell before the gate's, and the walk discards
      // the carry on the tick it meets the gate, the next.
      const fromGate = charges.slice(gating[0] + 1)
      expect(fromGate.map(({ kept }) => kept)).toEqual(fromGate.map(() => 0))
      expect(fromGate.slice(1).map(({ owes }) => owes)).toEqual(fromGate.slice(1).map(() => 0))
      expect(inexactTicksOf(charges)).toEqual([])
    })
  }

  for (const rig of [CRAWL_RIG, ...[44, 240].map(rigAt)]) {
    it(`a full hold's jam keeps the identity, at ${rig.speed} m/s`, () => {
      const cut = {
        rig,
        leg: COLUMN_LEG,
        maxTicks: 400,
        reachMm: 40_000,
        upgrades: { cargo_hold: 0 },
      }
      const { run, charges } = chargedLegOf(cut, recordingDebtTick)
      const vehicle = vehicleOf(run.ticks[run.ticks.length - 1].state, 'p1')
      expect(cargoUnitsOf(vehicle.cargo)).toBe(statsOfVehicle(vehicle).cargoCapacity)
      expect(inexactTicksOf(charges)).toEqual([])
      expect(charges.filter(({ owes }) => owes < 0)).toEqual([])
    })
  }
})

// The cells band (VS 6214466718, the wording ruled in 6215265226) reads the ledger cutting the rim:
// the debt only lowers later rim dwell, and only a wired ledger carves by dwell. Until #441 wires
// it, the live carve charges every rim sample a whole tick (300 m/s tilted reads 1.24 of the 5 m/s
// rig's cells over 100 m, measured on this branch), whichever ledger the recorder keeps, so no cells
// ratio here can read the debt. The bars stay todos owned by #471, whose second slice wires the debt
// with #441's ring (GD condition 3 on ticket 503); the one bar that holds without the wiring runs.
describe('the swept ledger keeps the cells band with the carry debt (ticket 471)', () => {
  it("the 300 m/s rig's own cells and charge are identical with and without the debt (ticket 471)", () => {
    for (const phase of PHASES) {
      const rig = rigAt(300)
      const without = chargedWindowOf(rig, TILTED_LEG, phase, recordingChargesTick)
      const owing = chargedWindowOf(rig, TILTED_LEG, phase, recordingDebtTick)
      expect(openedCellsOf(owing.run)).toEqual(openedCellsOf(without.run))
      expect(owing.charges.map(({ charged }) => charged)).toEqual(
        without.charges.map(({ charged }) => charged),
      )
    }
  })

  it.todo(
    'the 300 m/s tilted cells ratio over a 250 m window stays at most 1.050 on every tilted row and speed (ticket 471)',
  )

  it.todo(
    'the 100 m per-phase maximum cells ratio may only go down from 1.056 and is logged, not a band (ticket 471)',
  )

  it.todo(
    'the 240 m/s tilted cells ratio stays at most 1.050 on both the 100 m and 250 m windows (ticket 471)',
  )
})
