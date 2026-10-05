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
  /**
   * Report only (#6 acceptance 7, #29 Systems & Economy note 2): the core of each planet from 3 on
   * should take 25 to 120 minutes from arrival; outside it, `paceScale(p)` is retuned.
   */
  laterPlanetCoreMinutes: { min: 25, max: 120 },
  /**
   * Report only (vertical audit #75 section 3.1, campaign build plan #90, C4 #91): the
   * `pacing_targets_min` per-planet campaign entry, 45 to 60 minutes from arrival to core on every
   * planet. The pacing bot and the 0.7x dig-time check of #81 are held to it after the curve
   * changes land (C1, C2, C3); until then it never fails a build.
   */
  campaignPlanetMinutes: { min: 45, max: 60 },
} as const
