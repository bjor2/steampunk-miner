/**
 * Display text for a money amount. The debug API hands out 1e100, so large values switch to
 * scientific notation instead of printing a hundred digits.
 */

const SCIENTIFIC_FROM = 1e9

export function formatMoney(amount: number): string {
  if (!Number.isFinite(amount)) return 'unbounded'
  if (Math.abs(amount) >= SCIENTIFIC_FROM) return amount.toExponential(2).replace('e+', 'e')
  return groupThousands(Math.round(amount))
}

function groupThousands(whole: number): string {
  return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
