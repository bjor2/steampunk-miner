/**
 * Dev flags: engine changes that land switched off and are turned on together in a planned
 * re-baseline, never by the player. They are not unlocks, so they stay out of
 * `docs/scaling/horizontal/stats.json` and `FeatureUnlocked`.
 *
 * - `drill.sweptCut` (TD scope on #316, ticket 330): the client sends `drillStep` every fixed step
 *   its drill is engaged, so the authority cuts every tick instead of once per pose report. Off
 *   until the combined #304/#307 re-baseline; with it off the cut and the goldens are as before.
 *   With it on the motor also follows the drill (TD scope 0, ticket 333): while the cut gate is
 *   open the drill law's speed sets the speed along the facing, and otherwise the engine drives at
 *   travel parity's top speed. The cut gate rides on the swept cut's cursor, so it is saved and
 *   digested only once a step has been sent. With it on the body is also clamped to the rig's
 *   stats-derived step bound and its wait-for-cut window widens to it (TD scope a, ticket 334);
 *   the authority checks steps and reports against that bound whatever the flag, and the world
 *   steps in substeps at any speed, which stays one a tick at the 18 m/s clamp it keeps off.
 * - `drill.reportEveryTick` (ticket 514, TD shape on #441): with `drill.sweptCut` off, a pose report
 *   goes out every tick while the drill bites instead of every 12, removing the 5 Hz cut's hidden
 *   ceiling of about 5 m/s. Unlike the flags above it lands on: it is a kill-switch (HS on #514)
 *   that can only turn the every-tick cadence off. It takes only with the authority's
 *   `drill.exactCarry` on (below; VS 6236441275, TD 6236464931): a report every tick with the
 *   exact carry off is the stopped #529 set-up, so flipping `drill.exactCarry` is the one switch
 *   that turns it on, and until then the loop reports every 12 ticks. With `drill.sweptCut` on it
 *   reads nothing; the swept path keeps reports 12 ticks apart.
 */
export interface DevFlags {
  readonly 'drill.sweptCut': boolean
  readonly 'drill.reportEveryTick': boolean
}

export const DEV_FLAGS: DevFlags = { 'drill.sweptCut': false, 'drill.reportEveryTick': true }

/**
 * Dev flags the authority's rules read, apart from the client loop's `DevFlags` above:
 *
 * - `enemy.lureRetarget` (ticket 361, the #262 split): the hunters' step reads the `enemyLures`
 *   registry, so a crawler or burrower within a live lure's reach paths to its cell instead of the
 *   vehicle until the lure ends. On since the resonance whistle shipped (#262): with no lure
 *   sounding the step hunts the vehicle exactly as with the flag off, so every hunt and golden
 *   without a whistle blown is as before. Off, the registry is never read.
 * - `drill.exactCarry` (ticket 535, A6 "Option L" on #529, the TD shape 6228682000): a pose
 *   report's own cut (not one the swept cut's steps already cut) is charged on the density it
 *   removed at each cell's law time, the swept price, with an integer carry on the vehicle
 *   (`vehicle/cutCarry.ts`), and heats from the same tally; the carve itself is unchanged. Off in
 *   the game Bjor plays until #541's heat change has landed (G&V's condition, the GD 6234312287
 *   condition 1, Systems 6234342176): the #113 cap clips the law-exact feed at every tick on level
 *   bores, so fast rigs would run cooler than today. Off, the report charges the ticks its stamp
 *   removed something in and heats for its client-counted drill ticks, as protocol 84 did, and
 *   every golden replays to protocol 84's digests; on, only the two goldens whose reports drill
 *   move their digests (`logging/exactCarryOnGolden.test.ts`). The lanes and the charge's specs
 *   switch it on for their runs. On, it also turns on the client's every-tick drill reports
 *   (`drill.reportEveryTick` above, ticket 514).
 * - `drill.sweptLawCharge` (ticket 540, the TD seam 6234992964 as VS 6234998337 and the GD
 *   confirmed it, Systems' ruling 6231144515): the swept cut's `drillStep` is charged on the law
 *   work it removed with A6's rule and its energy carry (`LAW_SUB_STEP_CLOCK`), where it charged
 *   each broken cell its own dig energy, 0.62 to 1.74 times the law by geometry; the carve, its
 *   cells and its heat (the steps' summed dig time) are unchanged. A kill-switch for the
 *   authority's arithmetic: off, as `drill.sweptCut` is, and the two flip together behind the
 *   ticket's gates and #541's. Off, the swept cut is charged as shipped, the parity reference for
 *   #537 until the flip; with `drill.sweptCut` off no `drillStep` is sent and no digest moves.
 * - `drill.reportCapsule` (ticket 537, A7, the TD shape 6228947744 section 4 with the HS additions,
 *   bounded to interval 1 by the GD 6241320435): a pose report at interval 1, live only with
 *   `drill.exactCarry` (TD 6236464931), whose drill ran the tick since the last charged report on
 *   the same facing, carves the capsule from the previous reported pose's stamp to this one's
 *   instead of the bare disc at the pose, counted on the swept cut's sub-step clock
 *   (`authority/reportedCapsule.ts`), its drill gear's cells cut on every tick of the bite, so a
 *   report every tick no longer re-stamps a disc that leaves the rim between poses standing. The
 *   step is capped at one stamp radius (950 mm): a longer step, a fresh bite, a turn, a still rig,
 *   a 12-tick report and the exact carry off cut today's bare disc on today's clock, byte for
 *   byte, so the flag-off game never carves a capsule. The charge is the report's: the law work
 *   removed with the carry. A kill-switch, on: off, every report cut is protocol 86's.
 */
export interface AuthorityDevFlags {
  readonly 'enemy.lureRetarget': boolean
  readonly 'drill.exactCarry': boolean
  readonly 'drill.sweptLawCharge': boolean
  readonly 'drill.reportCapsule': boolean
}

export const AUTHORITY_DEV_FLAGS: AuthorityDevFlags = {
  'enemy.lureRetarget': true,
  'drill.exactCarry': false,
  'drill.sweptLawCharge': false,
  'drill.reportCapsule': true,
}
