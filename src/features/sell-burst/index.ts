/**
 * The sell burst slice's public API (docs/standards/feature-slices.md 2.1): the only file another
 * slice may import from this folder. The burst's timing data and its pure rules: the coins a sale
 * shows and peels, the net-keyed flare, merging, and the counter's roll.
 */
export const SELL_BURST_SLICE_ID = 'sell-burst'
export { BURST_TIMING, type BurstTiming } from './systems/burstTiming'
export type { BurstChunk, BurstSale, BurstWave } from './systems/burstWave'
export type { SellBurst } from './systems/sellBurst'
export { shownMoneyOf } from './systems/counterRoll'
export { liningTagPhaseAt, type LiningTagPhase } from './systems/liningTag'
