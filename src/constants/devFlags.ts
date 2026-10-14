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
 */
export interface DevFlags {
  readonly 'drill.sweptCut': boolean
}

export const DEV_FLAGS: DevFlags = { 'drill.sweptCut': false }

/**
 * Dev flags the authority's rules read, apart from the client loop's `DevFlags` above:
 *
 * - `enemy.lureRetarget` (ticket 361, the #262 split): the hunters' step reads the `enemyLures`
 *   registry, so a crawler or burrower within a live lure's reach paths to its cell instead of the
 *   vehicle until the lure ends. Off until the resonance whistle (#262) ships; with it off the
 *   registry is never read, and every hunt and golden is as before.
 */
export interface AuthorityDevFlags {
  readonly 'enemy.lureRetarget': boolean
}

export const AUTHORITY_DEV_FLAGS: AuthorityDevFlags = { 'enemy.lureRetarget': false }
