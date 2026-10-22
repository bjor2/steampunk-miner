/**
 * The unlock reveal slice's public API (docs/standards/feature-slices.md 2.1): the only file another
 * slice may import from this folder. The reveal's data and the rule that says which buys reveal.
 */
export const UNLOCK_REVEAL_SLICE_ID = 'unlock-reveal'
export { REVEAL, type RevealData } from './systems/revealData'
export {
  isRevealPlayingAt,
  revealOfBatch,
  type RevealedItem,
  type UnlockReveal,
} from './systems/unlockReveal'
