/**
 * Display text for a money amount. Display is non-authoritative (decision #5 rule 6): it reads
 * the canonical string and may round through doubles, because it never feeds back into state.
 * Large values switch to scientific notation instead of printing a hundred digits, and the
 * mantissa is taken from the string, so 1e5000 prints even though a double stops at 1.8e308.
 */
import { toCanonical, type Money } from './money'

const SCIENTIFIC_FROM_EXPONENT = 9

export function formatMoney(amount: Money): string {
  const canonical = toCanonical(amount)
  const [mantissa, exponent] = splitCanonical(canonical)
  if (exponent >= SCIENTIFIC_FROM_EXPONENT) return scientificText(mantissa, exponent)
  return groupThousands(Math.round(Number(canonical)))
}

function splitCanonical(canonical: string): [number, number] {
  const [mantissa, exponent] = canonical.split('e')
  return [Number(mantissa), Number(exponent)]
}

/** Three significant digits; rounding 9.995 up carries into the exponent. */
function scientificText(mantissa: number, exponent: number): string {
  const [digits, carry] = mantissa.toExponential(2).split('e')
  return `${digits}e${exponent + Number(carry)}`
}

function groupThousands(whole: number): string {
  return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
