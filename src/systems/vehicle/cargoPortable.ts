/**
 * The hold as a save holds it (ticket 849): each tier's units in their JSON spelling, a safe
 * integer while it fits and canonical decimal text past 2^53 (`wholeCount.ts`). Every hold a
 * cargo level up to 361 holds writes the bytes it always did, so an older save reads as it is.
 */
import { isJsonObject, isWholeNumber } from '../authority/payloadFields'
import { countOfJson, countToJson, isJsonCount, type JsonCount } from '../wholeCount'
import type { Cargo } from './vehicleState'

export interface PortableCargo {
  ore: Record<string, JsonCount>
  coreFragments: number
}

export function portableCargoOf(cargo: Cargo): PortableCargo {
  return { ore: mapCounts(cargo.ore, countToJson), coreFragments: cargo.coreFragments }
}

/** The hold read back; call only on a body `isPortableCargo` accepts. */
export function cargoOfPortable(cargo: PortableCargo): Cargo {
  return { ore: mapCounts(cargo.ore, countOfJson), coreFragments: cargo.coreFragments }
}

/** Whether a saved hold holds whole units per tier and whole core fragments. */
export function isPortableCargo(cargo: unknown): cargo is PortableCargo {
  return (
    isJsonObject(cargo) &&
    isWholeNumber(cargo.coreFragments) &&
    isJsonObject(cargo.ore) &&
    Object.values(cargo.ore).every(isJsonCount)
  )
}

function mapCounts<A, B>(
  counts: Readonly<Record<string, A>>,
  convert: (count: A) => B,
): Record<string, B> {
  return Object.fromEntries(Object.entries(counts).map(([tier, count]) => [tier, convert(count)]))
}
