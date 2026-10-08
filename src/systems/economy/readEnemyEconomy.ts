/** Reads the enemy and combat part of `economy.json` (decision #9, coefficients from #6 section 5). */
import { readIntegerList, readLiteral, readRange, type FieldReader } from './economyFieldReader'
import {
  ENEMY_KINDS,
  type CombatRules,
  type DensityByRadius,
  type Economy,
  type EnemyDef,
  type MetalEnemyTags,
  type TunnelWreckerRules,
  type WreckerCap,
} from './economyDefinition'

export function readEnemies(
  reader: FieldReader,
  enemies: Record<string, unknown>,
): Economy['enemies'] {
  const tier = reader.object('enemies.tier', enemies.tier)
  return {
    tier: {
      first: reader.safeInteger('enemies.tier.first', tier.first),
      perPlanet: reader.safeInteger('enemies.tier.perPlanet', tier.perPlanet),
      perBand: reader.safeInteger('enemies.tier.perBand', tier.perBand),
    },
    growth: reader.money('enemies.growth', enemies.growth),
    saturationTier: reader.safeInteger('enemies.saturationTier', enemies.saturationTier),
    kinds: reader
      .list('enemies.kinds', enemies.kinds)
      .map((kind, index) => readEnemyDef(reader, `enemies.kinds[${index}]`, kind)),
    metal: readMetalTags(reader, reader.object('enemies.metal', enemies.metal)),
    tunnelWrecker: readTunnelWrecker(
      reader,
      reader.object('enemies.tunnelWrecker', enemies.tunnelWrecker),
    ),
    combat: readCombat(reader, reader.object('enemies.combat', enemies.combat)),
  }
}

/** Each tag is true or false, and every built kind states one (#258 Q5). */
function readMetalTags(reader: FieldReader, tags: Record<string, unknown>): MetalEnemyTags {
  ENEMY_KINDS.filter((kind) => !(kind in tags)).forEach((kind) =>
    reader.record(`enemies.metal.${kind} must state true or false`),
  )
  return Object.fromEntries(
    Object.entries(tags).map(([id, tag]) => [id, readMetalTag(reader, id, tag)]),
  )
}

function readMetalTag(reader: FieldReader, id: string, tag: unknown): boolean {
  if (typeof tag === 'boolean') return tag
  reader.record(`enemies.metal.${id} must state true or false`)
  return false
}

function readTunnelWrecker(
  reader: FieldReader,
  rules: Record<string, unknown>,
): TunnelWreckerRules {
  const path = 'enemies.tunnelWrecker'
  return {
    gnawTicksPerRing: reader.safeInteger(`${path}.gnawTicksPerRing`, rules.gnawTicksPerRing),
    fleeTiles: reader.safeInteger(`${path}.fleeTiles`, rules.fleeTiles),
    ignoreVehicleTiles: reader.safeInteger(`${path}.ignoreVehicleTiles`, rules.ignoreVehicleTiles),
    minLinedRings: reader.safeInteger(`${path}.minLinedRings`, rules.minLinedRings),
    maxAliveByPlanet: reader
      .list(`${path}.maxAliveByPlanet`, rules.maxAliveByPlanet)
      .map((cap, index) => readWreckerCap(reader, `${path}.maxAliveByPlanet[${index}]`, cap)),
    respawnTicks: reader.safeInteger(`${path}.respawnTicks`, rules.respawnTicks),
  }
}

function readWreckerCap(reader: FieldReader, path: string, value: unknown): WreckerCap {
  const cap = reader.object(path, value)
  return {
    from: reader.safeInteger(`${path}.from`, cap.from),
    n: reader.safeInteger(`${path}.n`, cap.n),
  }
}

function readEnemyDef(reader: FieldReader, path: string, value: unknown): EnemyDef {
  const kind = reader.object(path, value)
  return {
    id: readLiteral(reader, `${path}.id`, kind.id, ENEMY_KINDS),
    health: reader.money(`${path}.health`, kind.health),
    baseHit: reader.money(`${path}.baseHit`, kind.baseHit),
    firstPlanet: reader.safeInteger(`${path}.firstPlanet`, kind.firstPlanet),
    bands: readIntegerList(reader, `${path}.bands`, kind.bands),
    moveTilesPerSecond: readRange(reader, `${path}.moveTilesPerSecond`, kind.moveTilesPerSecond),
    detectionTiles: readRange(reader, `${path}.detectionTiles`, kind.detectionTiles),
    attackCooldownTicks: readRange(reader, `${path}.attackCooldownTicks`, kind.attackCooldownTicks),
    windupTicks: reader.safeInteger(`${path}.windupTicks`, kind.windupTicks),
    lungeTilesPerSecond: reader.boundedNumber(
      `${path}.lungeTilesPerSecond`,
      kind.lungeTilesPerSecond,
    ),
    lungeTicks: reader.safeInteger(`${path}.lungeTicks`, kind.lungeTicks),
    recoilTicks: reader.safeInteger(`${path}.recoilTicks`, kind.recoilTicks),
  }
}

function readCombat(reader: FieldReader, combat: Record<string, unknown>): CombatRules {
  const share = reader.object('enemies.combat.burrowerShare', combat.burrowerShare)
  const path = 'enemies.combat'
  return {
    kFrontPlayer: reader.money(`${path}.kFrontPlayer`, combat.kFrontPlayer),
    kSidePlayer: reader.money(`${path}.kSidePlayer`, combat.kSidePlayer),
    kRearPlayer: reader.money(`${path}.kRearPlayer`, combat.kRearPlayer),
    kDrillVsEnemy: reader.money(`${path}.kDrillVsEnemy`, combat.kDrillVsEnemy),
    hitGraceTicks: reader.safeInteger(`${path}.hitGraceTicks`, combat.hitGraceTicks),
    maxActivePerVehicle: reader.safeInteger(
      `${path}.maxActivePerVehicle`,
      combat.maxActivePerVehicle,
    ),
    activationTiles: reader.safeInteger(`${path}.activationTiles`, combat.activationTiles),
    despawnTiles: reader.safeInteger(`${path}.despawnTiles`, combat.despawnTiles),
    spawnPointsPer10ChunksByBand: readIntegerList(
      reader,
      `${path}.spawnPointsPer10ChunksByBand`,
      combat.spawnPointsPer10ChunksByBand,
    ),
    densityByRadius: readDensityByRadius(
      reader,
      reader.object(`${path}.densityByRadius`, combat.densityByRadius),
    ),
    burrowerShare: {
      numerator: reader.safeInteger(`${path}.burrowerShare.numerator`, share.numerator),
      denominator: reader.safeInteger(`${path}.burrowerShare.denominator`, share.denominator),
    },
  }
}

function readDensityByRadius(
  reader: FieldReader,
  density: Record<string, unknown>,
): DensityByRadius {
  const path = 'enemies.combat.densityByRadius'
  return {
    fromPlanet: reader.safeInteger(`${path}.fromPlanet`, density.fromPlanet),
    refPlanet: reader.safeInteger(`${path}.refPlanet`, density.refPlanet),
    exponent: reader.safeInteger(`${path}.exponent`, density.exponent),
    floor: reader.money(`${path}.floor`, density.floor),
  }
}
