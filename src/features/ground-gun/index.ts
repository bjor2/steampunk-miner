/**
 * The ground-gun slice's public API (feature-slices.md 2.1): the only file another slice may
 * import from this folder. The armoury numbers of ticket 322: the bore's fixed numbers, the
 * three store tracks (stats per level, walls, planet-tied prices), the recovery timer and its
 * shots-a-minute card, the long barrel and extended barrels ladders, and Content's module
 * placeholders as Mark ladders.
 */
export const GROUND_GUN_SLICE_ID = 'ground-gun'
export type {
  ArmouryModule,
  AutoShootNumbers,
  BoreNumbers,
  BotNumbers,
  GunTrack,
  GunTrackId,
  GunTracks,
  LongBarrelNumbers,
  TrackPrice,
  TrackStatRule,
  TurretNumbers,
} from './systems/groundGunEconomy'
export { GROUND_GUN, GUN_TRACK_IDS } from './systems/groundGunEconomy'
export type { EnergyStats, PenetrationStats, RateStats } from './systems/gunTracks'
export {
  energyStatsAt,
  isTrackMaxed,
  levelsDueBy,
  penetrationStatsAt,
  rateStatsAt,
  targetPlanetOf,
  trackGapAt,
  trackLevelPrice,
  trackStatAt,
  trackWallLevel,
  wallLevelOf,
} from './systems/gunTracks'
export type { BoreShot, RateCard } from './systems/gunRecovery'
export {
  boreShotOnGround,
  gunDrillOf,
  gunRecoveryTicks,
  gunTicksPerCell,
  OPEN_GROUND_SHOT,
  rateCardOf,
  shotsPerMinuteOf,
} from './systems/gunRecovery'
