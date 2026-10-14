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
 *   digested only once a step has been sent.
 */
export interface DevFlags {
  readonly 'drill.sweptCut': boolean
}

export const DEV_FLAGS: DevFlags = { 'drill.sweptCut': false }
