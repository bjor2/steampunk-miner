/**
 * The debug API's `collapseState()` read (#43 Debug API): the weak blocks within 16 m of a vehicle
 * and the blocks warning or refilling, with the tick each refills at. A read, never a command:
 * nothing is logged and nothing changes.
 */
import { blockIdOf } from '../../world/collapseBlock'
import type { BlockWeakness } from '../../world/collapseWeakness'
import type { AuthorityState } from '../authorityState'
import { planetParamsOf } from '../planetOfState'
import { isWarningAt, refillTickOf } from './collapseState'
import { weakBlocksNearVehicles } from './collapseWatch'

export interface CollapseReport {
  weakBlocks: (BlockWeakness & { block: string })[]
  collapsing: {
    block: string
    startTick: number
    refillTick: number
    phase: 'warning' | 'refill'
    isForced: boolean
  }[]
}

export function collapseReportOf(state: AuthorityState): CollapseReport {
  const params = planetParamsOf(state.planet)
  const weak = params === null ? [] : weakBlocksNearVehicles(state, params)
  return {
    weakBlocks: weak.map(({ block, weakness }) => ({ block: blockIdOf(block), ...weakness })),
    collapsing: state.collapse.blocks.map((entry) => ({
      block: entry.block,
      startTick: entry.startTick,
      refillTick: refillTickOf(entry),
      phase: isWarningAt(entry, state.tick) ? 'warning' : 'refill',
      isForced: entry.isForced,
    })),
  }
}
