import { afterAll, describe, expect, it } from 'vitest'
import {
  CHARGE_LEGS,
  CHARGE_RIGS,
  chargedWindowOf,
  chargeRowLineOf,
  legChargeOf,
  OVER_CHARGE_BOUND,
  overChargeOf,
  unconservedTicksOf,
  type ChargePhase,
} from './sweptChargeFixtures'

// Ticket 466's conservation line over every tick phase and start offset the TD measured fix A at
// (tick phases 1, 7, 19, 31, start offsets 0, 41 and 83 mm, on #466): the ledger charges the paid
// prices, the final carry and the carried-in work dropped, to the sub-step after every tick, and no
// row over-charges by more than 8%. `sweptChargeConservation.test.ts` runs two of the phases in the
// suite; this lane (about 1 min) runs only when named.

const PHASES: readonly ChargePhase[] = [1, 7, 19, 31].flatMap((startTick) =>
  [0, 41, 83].map((offsetMm) => ({ startTick, offsetMm })),
)

const rows: string[] = []

afterAll(() => {
  console.log(`swept charge conservation by phase (ticket 466)\n${rows.join('\n')}`)
})

describe('swept ledger charges the work it spends at every phase (ticket 466)', () => {
  for (const phase of PHASES) {
    for (const { name, leg } of CHARGE_LEGS) {
      for (const rig of CHARGE_RIGS) {
        const label = `${name} at ${rig.speed} m/s, tick ${phase.startTick}, start +${phase.offsetMm} mm`
        it(`conserves the work it charges and over-charges at most 8%, ${label}`, () => {
          const { charges } = chargedWindowOf(rig, leg, phase)
          const charge = legChargeOf(charges)
          rows.push(chargeRowLineOf(label, charge))
          expect(unconservedTicksOf(charges)).toEqual([])
          expect(overChargeOf(charge)).toBeLessThanOrEqual(OVER_CHARGE_BOUND)
        })
      }
    }
  }
})
