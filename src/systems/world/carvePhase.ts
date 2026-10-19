/**
 * The carve's tick phase, exact at any drill quantum and any tick (ticket 558, #551 B1). A carve
 * removes `floor(a (T0 + k) / b) - floor(a T0 / b)` from a sample (`groundEdit.ts`, `rimDwell.ts`),
 * where `a` is `255 w Q` and `T0` the authority tick, so the product `a T0` passes 2^53 after about
 * 440 days at the base quantum (60) but after about 5 hours at the lifted one. Only `a T0` modulo
 * `b`, the phase, decides the removal, so it is taken modulo `b` first: the same integers wherever
 * the product was exact, and from BigInt past it, as `exactSquares.ts` does for squares.
 */

/** `(a * t) mod m` for non-negative safe integers, exact even where `a * t` passes 2^53. */
export function productModuloOf(a: number, t: number, m: number): number {
  const product = a * t
  if (Number.isSafeInteger(product)) return product % m
  return Number((BigInt(a) * BigInt(t)) % BigInt(m))
}

/** A carve rate: `perTick` density a tick over `per`, both whole numbers. */
export interface CarveRate {
  perTick: number
  per: number
}

/** `floor(a (T0 + k) / b) - floor(a T0 / b)`: what `ticks` ticks from `firstTick` remove. */
export function removalOverTicks(rate: CarveRate, firstTick: number, ticks: number): number {
  const phase = productModuloOf(rate.perTick, firstTick, rate.per)
  return Math.floor((phase + rate.perTick * ticks) / rate.per)
}

/** The fewest ticks from `firstTick` whose removal reaches `amount`. */
export function ticksToRemoveFrom(rate: CarveRate, firstTick: number, amount: number): number {
  const phase = productModuloOf(rate.perTick, firstTick, rate.per)
  return Math.ceil((amount * rate.per - phase) / rate.perTick)
}
