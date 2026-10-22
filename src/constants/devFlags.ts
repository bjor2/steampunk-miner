/**
 * Every flag in this file ships ON (Bjor, 18 Oct 2026: "Turn everything on then. No reason to keep
 * feature toggles off in this game."). The flags stay as kill-switches and for the specs that read
 * the off paths; a later cleanup may delete them. Read each "off" below as the path a spec can
 * still switch to, not as what the game plays.
 *
 * Dev flags: engine changes that landed switched off and were turned on together, never by the player. They are not unlocks, so they stay out of
 * `docs/scaling/horizontal/stats.json` and `FeatureUnlocked`.
 *
 * - `drill.sweptCut` (TD scope on #316, ticket 330): the client sends `drillStep` every fixed step
 *   its drill is engaged, so the authority cuts every tick instead of once per pose report. On since
 *   18 Oct 2026 (it waited on the combined #304/#307 re-baseline); with it off the cut and the goldens are as before.
 *   With it on the motor also follows the drill (TD scope 0, ticket 333): while the cut gate is
 *   open the drill law's speed sets the speed along the facing (sideways never past the drive's,
 *   ticket 723), and otherwise the engine drives at its own top speed. The cut gate rides on the swept cut's cursor, so it is saved and
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

export const DEV_FLAGS: DevFlags = { 'drill.sweptCut': true, 'drill.reportEveryTick': true }

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
 *   (`vehicle/cutCarry.ts`), and heats from the same tally; the carve itself is unchanged. On since 18 Oct 2026; it was off in
 *   the game Bjor played until #541's heat change had landed (G&V's condition, the GD 6234312287
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
 *   authority's arithmetic: on since 18 Oct 2026 with `drill.sweptCut`, which it flipped together behind the
 *   ticket's gates and #541's. Off, the swept cut is charged as shipped, the parity reference for
 *   #537 until the flip; with `drill.sweptCut` off no `drillStep` is sent and no digest moves.
 * - `drill.reportCapsule` (ticket 537, A7, the TD shape 6228947744 section 4 with the HS additions,
 *   bounded to interval 1 by the GD 6241320435): a pose report at interval 1, live only with
 *   `drill.exactCarry` (TD 6236464931), whose drill ran the tick since the last charged report on
 *   the same facing, carves the capsule from the previous reported pose's stamp to this one's
 *   instead of the bare disc at the pose, counted on the swept cut's sub-step clock
 *   (`authority/reportedCapsule.ts`), its drill gear's cells cut on every tick of the bite, so a
 *   report every tick no longer re-stamps a disc that leaves the rim between poses standing. The
 *   step is capped at one stamp radius (half the bore): a longer step, a fresh bite, a turn, a still rig,
 *   a 12-tick report and the exact carry off cut today's bare disc on today's clock, byte for
 *   byte, so the flag-off game never carves a capsule. The charge is the report's: the law work
 *   removed with the carry. A kill-switch, on: off, every report cut is protocol 86's.
 * - `heat.workUncapped` (ticket 541, shape (b): the TD seam 6232743242 priced by Systems 6232736622,
 *   VS and G&V voting (b), the GD's acceptance and Bjor's go on the felt heat): a report's drill
 *   ticks heat for all the law work they stand for, where the #113 rule clipped them at the ticks
 *   since the gauge settled and dropped 14 to 41% of the law heat on fast and ladder rows. The
 *   drill segment keeps its wall ticks and heats `drillHeat × work` over them; band heat and cooling
 *   still run per elapsed tick, and the gauge at its max behaves as before. A report at the tick
 *   the gauge settled leaves the exact carry's work on the carry for the next one. On the report
 *   path, the charged branch and swept alike; a scripted drill heats from its law work's carry
 *   (ticket 559), held at the tick the gauge settled, so the bot's heat is the same either way. On since 18 Oct 2026 (Bjor's go); it was off until the paired
 *   run shows the per-trip heat budget as accepted (G&V condition 4): off, every heat settle is
 *   protocol 87's.
 * - `codex.materialContact` (ticket 546, the TD's contact rule 6243331970 as the GD amended it
 *   6243342631): the codex's reaction records `material:<species id>` the first time a player
 *   really touches a cell of that species: the drill's damage on it, a gate stopping the drill
 *   on it, its unit reaching the hold, or a tool sampling it. A kill-switch, on: off, no
 *   `material:` key is written and every digest is protocol 88's.
 * - `drill.noseContact` (ticket 564, C2 of #551: the TD's shape 6254962969 as the VS amended it
 *   6254978633 and the HS conditioned it 6254968595): the authority tests enemy contact on the
 *   body's walked path inside every `drillStep`, so an enemy the nose crosses is engaged at any
 *   speed. One whose tier's rock the rig's gate tip scratches rides the nose and dies after its
 *   dwell ticks, the rig keeping its speed; a tougher one, the wrecker and the core guardian
 *   hold the cut for their dwell, then die (`combat/noseRide.ts`). **The one flag that ships
 *   off**, against the line above (VS 6254978633, the TD's ruling 2): while the dwell reads drill
 *   power it is a hidden combat power gain (62x at L20), so it waits for the combat damage track
 *   (#565), which flips it on; `contactAtSpeed.test.ts` holds the 84 m/s dwell row as known red
 *   under #565 until then. Off, contact is the pose-only pin of #9 and no digest moves.
 */
export interface AuthorityDevFlags {
  readonly 'enemy.lureRetarget': boolean
  readonly 'drill.exactCarry': boolean
  readonly 'drill.sweptLawCharge': boolean
  readonly 'drill.reportCapsule': boolean
  readonly 'heat.workUncapped': boolean
  readonly 'codex.materialContact': boolean
  readonly 'drill.noseContact': boolean
}

export const AUTHORITY_DEV_FLAGS: AuthorityDevFlags = {
  'enemy.lureRetarget': true,
  'drill.exactCarry': true,
  'drill.sweptLawCharge': true,
  'drill.reportCapsule': true,
  'heat.workUncapped': true,
  'codex.materialContact': true,
  'drill.noseContact': false,
}

/** Every dev flag at one value: the shipped defaults, or a session's. */
export type ShippedDevFlags = DevFlags & AuthorityDevFlags

/**
 * Every dev flag at its shipped default, the client loop's and the authority's. This module is the
 * one place the two are joined, so the client flag store and the panel read the defaults from here
 * and never name `AUTHORITY_DEV_FLAGS` themselves (ticket 548, TD ruling on #418).
 */
export const SHIPPED_DEV_FLAGS: ShippedDevFlags = { ...DEV_FLAGS, ...AUTHORITY_DEV_FLAGS }
