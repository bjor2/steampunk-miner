/**
 * The minerals of a run in the order they were mined (#122, `TEST-LOGGING-STRATEGY.md` section 4),
 * run-length encoded so a long session stays short: `[["kernel.metal.t1", 12], ["kernel.crystal.t2",
 * 3], ...]`, plus the units of each ore. `summary.json` folds it from the `drill_cut` lines' `ores`
 * (ticket 420) and the `resource_collected` lines of ore that came some other way, and a golden
 * run from the `CargoAdded` events its replay gives, so both read the same sequence.
 */

/** Units of one ore mined back to back: `[oreId, units]`. */
export type MinedRun = [oreId: string, units: number]

export interface MinedOrder {
  runs: MinedRun[]
  /** Ore id to every unit of it mined. */
  unitsByOre: Record<string, number>
}

/** What one collected unit or batch says of its ore. */
export interface MinedOre {
  oreId: string
  amount: number
}

export function emptyMinedOrder(): MinedOrder {
  return { runs: [], unitsByOre: {} }
}

/** The mined order of `ores`, in their order. */
export function minedOrderOf(ores: readonly MinedOre[]): MinedOrder {
  return ores.reduce(addMinedOre, emptyMinedOrder())
}

/** Appends `ore` to `order` in place, as the summary's tally folds, and returns it. */
export function addMinedOre(order: MinedOrder, { oreId, amount }: MinedOre): MinedOrder {
  extendMinedRuns(order.runs, oreId, amount)
  order.unitsByOre[oreId] = (order.unitsByOre[oreId] ?? 0) + amount
  return order
}

/** Appends `amount` of `oreId` to the runs in place: the last run grows when it is that ore. */
export function extendMinedRuns(runs: MinedRun[], oreId: string, amount: number): void {
  const last = runs.at(-1)
  if (last !== undefined && last[0] === oreId) last[1] += amount
  else runs.push([oreId, amount])
}

/** A copy later additions leave as it was. */
export function copyMinedOrder(order: MinedOrder): MinedOrder {
  return {
    runs: order.runs.map(([oreId, units]): MinedRun => [oreId, units]),
    unitsByOre: { ...order.unitsByOre },
  }
}
