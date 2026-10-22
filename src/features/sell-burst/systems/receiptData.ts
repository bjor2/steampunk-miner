/**
 * The sale receipt's roll and copy (ticket 717), read from `receipt.json`: the total rolls up in
 * at most `maxTicks` 60 Hz ticks, in `steps` steps, and every word the receipt shows is a row of
 * the file, never typed in a component.
 */
import RECEIPT_FILE from '../receipt.json'

export type TripCompare = 'up' | 'down' | 'level'

export interface ReceiptData {
  roll: { maxTicks: number; steps: number }
  copy: {
    title: string
    lining: string
    total: string
    lastTrip: string
    firstTrip: string
    unseenRarity: string
    tierOre: string
    compare: Record<TripCompare, string>
  }
}

export const RECEIPT: ReceiptData = RECEIPT_FILE

/** The name of a sold unit no pickup named: `Tier 7 ore`, as the Hold's card calls its tier. */
export function tierOreNameOf(tier: number, data: ReceiptData = RECEIPT): string {
  return data.copy.tierOre.replace('{tier}', String(tier))
}
