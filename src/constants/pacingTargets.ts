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
  /**
   * Report only (#81 acceptance 1, C3 #86 as the Game Director restated it): on every planet the
   * pacing bot reaches, the drill time per metre of band 5 at departure is at most this multiple
   * of its time on arrival, on the median of the pacing seeds (`npm run balance:planets`).
   */
  sawtoothDepartureRatioMax: 0.7,
  /**
   * Report only (spec #111, Systems & Economy numbers): on planets 6 to 9 the median dive has 2 to 8
   * rings breached by tunnel wreckers, and at most 5 dives in 100 set off a collapse on the way home.
   * A miss is a balance finding; the single lever is `gnawTicksPerRing` (180 to 600).
   */
  wreckerPlanets: { first: 6, last: 9 },
  wreckerRingsBreachedPerDive: { min: 2, max: 8 },
  wreckerCollapseDivesPerHundred: 5,
  /**
   * Report only (#105 numbers, single-lever rule): the bot refining may shorten a planet by at most
   * this many percent against the run without the refinery, and may not push a planet that took
   * at least `campaignPlanetMinutes.min` below it. Past either, `valueMultiplier` is lowered
   * (floor 1.15), never `k_casing`.
   */
  refineryMaxPlanetSpeedupPercent: 10,
  /**
   * Report only (#180 section 4, judged per track by the GD lock on #181, 7 Oct): the median steps
   * per bought track a Workshop visit, and the share of above-median-income trips that buy
   * `spreeSteps` or more steps on one track. 10 minors per major and the curves stay; a miss puts
   * the measured number on the issue, and #225 re-measures after #195 and #146.
   */
  spree: {
    stepsPerBoughtTrack: { min: 6, max: 12 },
    spreeSteps: 10,
    spreePercent: { min: 25, max: 45 },
  },
} as const
