/**
 * The pacing targets the balance-regression bot is gated on (#29 acceptance, settled by the Game
 * Director on #17): the first-ten-minutes beats of #16 and the bot's planet 1 core and slice
 * ranges of #6 acceptance 7. The human targets (planet 1 core in 45 to 60 minutes, the slice in
 * 1.5 to 2 hours) are decided at the playtest, not here. Change a number when the design does.
 */
export const PACING_TARGETS = {
  firstSaleSeconds: 120,
  firstUpgradeSeconds: 240,
  /** By ten minutes: at least 3 upgrades across at least 2 tracks, and band 2 reached. */
  earlyCheckSeconds: 600,
  earlyUpgrades: 3,
  earlyTracks: 2,
  earlyBand: 2,
  planet1CoreMinutes: { min: 30, max: 60 },
  sliceMinutes: { min: 90, max: 130 },
  /** Report only (#29 Systems & Economy note 4): alert when a planet takes fewer or more trips. */
  tripsPerPlanet: { min: 3, max: 12 },
} as const
