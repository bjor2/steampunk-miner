/**
 * The unlock reveal plate's `data-testid`s, apart from the component so a Playwright spec can read
 * them without loading React, the store and the plate's CSS module (ticket 903).
 */
export const REVEAL_TEST_IDS = {
  plate: 'unlock-reveal-plate',
  name: 'unlock-reveal-name',
} as const
