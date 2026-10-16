/**
 * What the exact-charge specs read of a leg cut through the debt recorder (ticket 471's slice 1,
 * ticket 503; the TD shape 6214473101 on #471): whether every tick charged the paid prices, the
 * stored carry and the debt owed, and how much debt the leg owed. Only specs use it.
 */
import type { TilePoint } from '../world/tileGrid'
import type { TickCharge } from './sweptChargeFixtures'
import { eventsOfLeg, type LegRun } from './sweptRigFixtures'

/**
 * The ticks after which the leg so far charged other than its paid prices, the carry the cursor
 * stored then and the debt owed then: none when work charged equals work spent and owed.
 */
export function inexactTicksOf(charges: readonly TickCharge[]): number[] {
  let charged = 0
  let paid = 0
  return charges.flatMap((charge, tick) => {
    charged += charge.charged
    paid += charge.paid
    return charged === paid + charge.stored + charge.owes ? [] : [tick]
  })
}

/** The debt a leg owed: at its end, at most, and on how many ticks a debt was left. */
export interface LegDebt {
  final: number
  most: number
  owingTicks: number
}

export function legDebtOf(charges: readonly TickCharge[]): LegDebt {
  const owed = charges.map(({ owes }) => owes)
  return {
    final: owed.at(-1) ?? 0,
    most: Math.max(0, ...owed),
    owingTicks: owed.filter((owes) => owes > 0).length,
  }
}

/** One printed row: the leg's ticks, its work charged and paid, the stored carry and its debt. */
export function debtRowLineOf(label: string, charges: readonly TickCharge[]): string {
  const sum = (part: (charge: TickCharge) => number) =>
    charges.reduce((total, charge) => total + part(charge), 0)
  const { final, most, owingTicks } = legDebtOf(charges)
  const stored = charges.at(-1)?.stored ?? 0
  const work = `charged ${sum(({ charged }) => charged)}, paid ${sum(({ paid }) => paid)}`
  return `${label}: ticks ${charges.length}, ${work}, stored ${stored}, debt ${final} at the end, at most ${most}, owed on ${owingTicks} ticks`
}

/** The cells the leg's cut opened, in the order it reported them. */
export function openedCellsOf(run: LegRun): TilePoint[] {
  return eventsOfLeg(run).flatMap((event) =>
    event.type === 'TileDestroyed' ? [{ tx: event.tx, ty: event.ty }] : [],
  )
}
