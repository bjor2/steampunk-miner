import { afterAll, describe, expect, it } from 'vitest'
import {
  CHARGE_LEGS,
  CHARGE_RIGS,
  chargedWindowOf,
  recordingDebtTick,
  type ChargePhase,
} from './sweptChargeFixtures'
import { debtRowLineOf, inexactTicksOf, legDebtOf } from './sweptDebtFixtures'

// Ticket 471's exact line (slice 1, ticket 503) over every tick phase and start offset the TD
// measured the debt at (tick phases 1, 7, 19, 31, start offsets 0, 41 and 83 mm, 6214473101 on
// #471): the ledger, paying the carry debt, charges the paid prices, the stored carry and the debt
// owed, to the sub-step after every tick; the debt is never below 0 and is 0 from 78 m/s up.
// `sweptChargeExact.test.ts` runs two of the phases in the suite, and its cells-band todos stand
// here too; this lane (about 1 min) runs only when named.

const PHASES: readonly ChargePhase[] = [1, 7, 19, 31].flatMap((startTick) =>
  [0, 41, 83].map((offsetMm) => ({ startTick, offsetMm })),
)

const DEBT_FREE_FROM_M_PER_S = 78

const rows: string[] = []

afterAll(() => {
  console.log(`swept charge with the carry debt by phase (ticket 471)\n${rows.join('\n')}`)
})

describe('the swept ledger charges exactly what it spends at every phase (ticket 471)', () => {
  for (const phase of PHASES) {
    for (const { name, leg } of CHARGE_LEGS) {
      for (const rig of CHARGE_RIGS) {
        const label = `${name} at ${rig.speed} m/s, tick ${phase.startTick}, start +${phase.offsetMm} mm`
        it(`charges the paid prices, the kept carry and the debt owed after every tick, ${label}`, () => {
          const { charges } = chargedWindowOf(rig, leg, phase, recordingDebtTick)
          const debt = legDebtOf(charges)
          rows.push(debtRowLineOf(label, charges))
          expect(inexactTicksOf(charges)).toEqual([])
          expect(charges.filter(({ owes }) => owes < 0)).toEqual([])
          if (rig.speed >= DEBT_FREE_FROM_M_PER_S) {
            expect(debt).toEqual({ final: 0, most: 0, owingTicks: 0 })
          }
        })
      }
    }
  }
})
