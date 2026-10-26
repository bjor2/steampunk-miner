/**
 * Reads the `blasting_charges` part of `economy.json` (spec #109, the size ladder of K8 #218, its
 * 12 rows of 3 types and the Blast Radius track's growth from D1 #860, the bare blast's collapse
 * chance per size from D2 #861, the gate tiers of blast-only rock from D4 #863, the charge price,
 * the track's curve and the dynamite nodes' price anchors from D6 #865).
 */
import { BASIS_POINTS } from '../../constants/balance'
import { add, ceil, cmp, fromCanonical, ZERO_MONEY, type BigStat } from '../money'
import type {
  BlastGateTiers,
  BlastingChargeRules,
  BlastNodePriceAnchors,
  BlastRadiusTrack,
  ChargePriceRows,
  ChargeSizeLadder,
  CostCurve,
} from './economyDefinition'
import { readIntegerList, type FieldReader } from './economyFieldReader'

const PATH = 'blastingCharges'
const SIZES_PATH = `${PATH}.sizes`
const TRACK_PATH = `${PATH}.radiusTrack`
const GATE_TIERS_PATH = `${PATH}.gateTiers`
const PRICE_PATH = `${PATH}.price`
const ANCHORS_PATH = `${PATH}.nodePriceAnchors`
const ONE = fromCanonical('1')
/** The only growth whose square is linear in the level, so r² stays an integer (TD on #860). */
const SQUARE_ROOT = '0.5'

export function readBlastingCharges(
  reader: FieldReader,
  rules: Record<string, unknown>,
  costCurves: readonly CostCurve[],
): BlastingChargeRules {
  const read: BlastingChargeRules = {
    selfHit: reader.money(`${PATH}.selfHit`, rules.selfHit),
    enemyDamageHealthMultiple: reader.money(
      `${PATH}.enemyDamageHealthMultiple`,
      rules.enemyDamageHealthMultiple,
    ),
    warnTiles: reader.safeInteger(`${PATH}.warnTiles`, rules.warnTiles),
    rackStart: reader.safeInteger(`${PATH}.rackStart`, rules.rackStart),
    rackMax: reader.safeInteger(`${PATH}.rackMax`, rules.rackMax),
    rackSlotCostCurveId: reader.text(`${PATH}.rackSlotCostCurveId`, rules.rackSlotCostCurveId),
    botBlastThresholdTicks: reader.safeInteger(
      `${PATH}.botBlastThresholdTicks`,
      rules.botBlastThresholdTicks,
    ),
    radiusTrack: readRadiusTrack(reader, reader.object(TRACK_PATH, rules.radiusTrack)),
    price: readChargePrice(reader, reader.object(PRICE_PATH, rules.price)),
    nodePriceAnchors: readNodePriceAnchors(
      reader,
      reader.object(ANCHORS_PATH, rules.nodePriceAnchors),
    ),
    gateTiers: readGateTiers(reader, reader.object(GATE_TIERS_PATH, rules.gateTiers)),
    sizes: readChargeSizes(reader, reader.object(SIZES_PATH, rules.sizes)),
  }
  checkRackSlotCurve(reader, read, costCurves)
  checkChargeSizes(reader, read)
  checkRadiusTrack(reader, read.radiusTrack)
  checkRadiusTrackCurve(reader, read.radiusTrack, costCurves)
  checkChargePrice(reader, read.price)
  checkNodePriceAnchors(reader, read.nodePriceAnchors)
  checkGateTiers(reader, read)
  return read
}

function readChargePrice(reader: FieldReader, price: Record<string, unknown>): ChargePriceRows {
  return {
    kDyn: reader.money(`${PRICE_PATH}.kDyn`, price.kDyn),
    worthBand: reader.safeInteger(`${PRICE_PATH}.worthBand`, price.worthBand),
    cellsExponent: reader.money(`${PRICE_PATH}.cellsExponent`, price.cellsExponent),
  }
}

function readNodePriceAnchors(
  reader: FieldReader,
  anchors: Record<string, unknown>,
): BlastNodePriceAnchors {
  return {
    blastCasing: reader.safeInteger(`${ANCHORS_PATH}.blastCasing`, anchors.blastCasing),
    blastBit: reader.safeInteger(`${ANCHORS_PATH}.blastBit`, anchors.blastBit),
  }
}

function readGateTiers(reader: FieldReader, tiers: Record<string, unknown>): BlastGateTiers {
  return {
    fromPlanet: readIntegerList(reader, `${GATE_TIERS_PATH}.fromPlanet`, tiers.fromPlanet),
    newestTierLead: reader.safeInteger(`${GATE_TIERS_PATH}.newestTierLead`, tiers.newestTierLead),
  }
}

function readRadiusTrack(reader: FieldReader, track: Record<string, unknown>): BlastRadiusTrack {
  return {
    levelDivisor: reader.safeInteger(`${TRACK_PATH}.levelDivisor`, track.levelDivisor),
    exponent: reader.money(`${TRACK_PATH}.exponent`, track.exponent),
    costCurveId: reader.text(`${TRACK_PATH}.costCurveId`, track.costCurveId),
  }
}

function readChargeSizes(reader: FieldReader, sizes: Record<string, unknown>): ChargeSizeLadder {
  return {
    radius: reader
      .list(`${SIZES_PATH}.radius`, sizes.radius)
      .map((entry, index) => reader.money(`${SIZES_PATH}.radius[${index}]`, entry)),
    type: readIntegerList(reader, `${SIZES_PATH}.type`, sizes.type),
    breaksGateByType: reader
      .list(`${SIZES_PATH}.breaksGateByType`, sizes.breaksGateByType)
      .map((tiers, index) =>
        readIntegerList(reader, `${SIZES_PATH}.breaksGateByType[${index}]`, tiers),
      ),
    keptBase: reader.money(`${SIZES_PATH}.keptBase`, sizes.keptBase),
    keptRatio: reader.money(`${SIZES_PATH}.keptRatio`, sizes.keptRatio),
    rackSlots: readIntegerList(reader, `${SIZES_PATH}.rackSlots`, sizes.rackSlots),
    fuseTicks: readIntegerList(reader, `${SIZES_PATH}.fuseTicks`, sizes.fuseTicks),
    lethalCoreFrom: reader.safeInteger(`${SIZES_PATH}.lethalCoreFrom`, sizes.lethalCoreFrom),
    lethalCoreFraction: reader.money(`${SIZES_PATH}.lethalCoreFraction`, sizes.lethalCoreFraction),
    remoteDisarmTicks: reader.safeInteger(
      `${SIZES_PATH}.remoteDisarmTicks`,
      sizes.remoteDisarmTicks,
    ),
    collapseBp: readIntegerList(reader, `${SIZES_PATH}.collapseBp`, sizes.collapseBp),
  }
}

/** Every rack slot level adds one slot, so the `bandOre` curve prices `rackMax - rackStart`. */
function checkRackSlotCurve(
  reader: FieldReader,
  rules: BlastingChargeRules,
  costCurves: readonly CostCurve[],
): void {
  const curve = costCurves.find((candidate) => candidate.id === rules.rackSlotCostCurveId)
  if (curve === undefined || curve.family !== 'bandOre') {
    reader.record(`${PATH}.rackSlotCostCurveId ${rules.rackSlotCostCurveId} has no bandOre curve`)
  } else if (rules.rackStart + curve.oreUnitsByLevel.length !== rules.rackMax) {
    reader.record(`${PATH}.rackMax must be rackStart plus one per ${curve.id} level`)
  }
}

/** The track is a level line priced per purchase, like the vehicle tracks (D6 #865). */
function checkRadiusTrackCurve(
  reader: FieldReader,
  track: BlastRadiusTrack,
  costCurves: readonly CostCurve[],
): void {
  const curve = costCurves.find((candidate) => candidate.id === track.costCurveId)
  if (curve === undefined || curve.family !== 'geometricPerPurchase') {
    reader.record(
      `${TRACK_PATH}.costCurveId ${track.costCurveId} has no geometricPerPurchase curve`,
    )
  }
}

/** A positive coefficient, a band that exists, and a cells exponent above 0 and at most 1. */
function checkChargePrice(reader: FieldReader, price: ChargePriceRows): void {
  const checks: [boolean, string][] = [
    [cmp(price.kDyn, ZERO_MONEY) > 0, 'kDyn must be above 0'],
    [price.worthBand >= 1, 'worthBand must be at least 1'],
    [
      cmp(price.cellsExponent, ZERO_MONEY) > 0 && cmp(price.cellsExponent, ONE) <= 0,
      'cellsExponent must lie above 0 and at most 1',
    ],
  ]
  checks
    .filter(([isMet]) => !isMet)
    .forEach(([, problem]) => reader.record(`${PRICE_PATH}.${problem}`))
}

/** Planets from 1, Blast Casing anchored no later than `blastBit` (the order the VS rows give). */
function checkNodePriceAnchors(reader: FieldReader, anchors: BlastNodePriceAnchors): void {
  if (anchors.blastCasing < 1 || anchors.blastBit < 1) {
    reader.record(`${ANCHORS_PATH} must name planets from 1`)
  }
  if (anchors.blastCasing > anchors.blastBit) {
    reader.record(`${ANCHORS_PATH}.blastCasing must not be anchored after blastBit`)
  }
}

/** One entry per size in every per-size list, radii growing, and each size fitting a full rack. */
function checkChargeSizes(reader: FieldReader, rules: BlastingChargeRules): void {
  ladderProblems(rules).forEach((problem) => reader.record(`${SIZES_PATH}.${problem}`))
}

function ladderProblems({ sizes, rackMax }: BlastingChargeRules): string[] {
  const count = sizes.radius.length
  const checks: [boolean, string][] = [
    [count > 0, 'radius must list at least size 1'],
    [isGrowing(sizes.radius), 'radius must grow with every size'],
    [sizes.radius.every(isWholeHalfTiles), 'radius must be whole half-tiles'],
    [sizes.type.length === count, 'type must hold one entry per radius'],
    [isTypeLadder(sizes), 'type must run from 1 up to every type, never down'],
    [
      sizes.breaksGateByType.every((tiers) => tiers.length > 0 && tiers.every((tier) => tier >= 1)),
      'breaksGateByType must list at least one gate tier from 1 per type',
    ],
    [sizes.rackSlots.length === count, 'rackSlots must hold one entry per radius'],
    [
      sizes.rackSlots.every((slots) => slots >= 1 && slots <= rackMax),
      'rackSlots must fit 1 to rackMax',
    ],
    [
      sizes.fuseTicks.length >= 1 && sizes.fuseTicks.length <= count,
      'fuseTicks must fuse size 1 and no size past the radius list',
    ],
    [sizes.fuseTicks.every((ticks) => ticks >= 1), 'fuseTicks must be at least 1'],
    [sizes.remoteDisarmTicks >= 1, 'remoteDisarmTicks must be at least 1'],
    [sizes.collapseBp.length === count, 'collapseBp must hold one entry per radius'],
    [sizes.collapseBp.every(isBasisPoints), 'collapseBp must lie in 0 to 10000'],
  ]
  return checks.filter(([isMet]) => !isMet).map(([, problem]) => problem)
}

/** The level divides the track, and its root is the square root the integer r² needs. */
function checkRadiusTrack(reader: FieldReader, track: BlastRadiusTrack): void {
  if (track.levelDivisor < 1) reader.record(`${TRACK_PATH}.levelDivisor must be at least 1`)
  if (cmp(track.exponent, fromCanonical(SQUARE_ROOT)) !== 0) {
    reader.record(`${TRACK_PATH}.exponent must be ${SQUARE_ROOT}: r² is an integer only then`)
  }
}

/**
 * Tiers laid from planet 1 on, never earlier than the tier below, and every tier broken by some
 * type while no type names a tier that is never laid: so each gated cell has a charge that opens it.
 */
function checkGateTiers(reader: FieldReader, rules: BlastingChargeRules): void {
  gateTierProblems(rules).forEach((problem) => reader.record(`${GATE_TIERS_PATH}.${problem}`))
}

function gateTierProblems({ gateTiers, sizes }: BlastingChargeRules): string[] {
  const { fromPlanet, newestTierLead } = gateTiers
  const named = new Set(sizes.breaksGateByType.flat())
  const tiers = fromPlanet.map((_, at) => at + 1)
  const checks: [boolean, string][] = [
    [fromPlanet.length > 0, 'fromPlanet must lay at least tier 1'],
    [fromPlanet.every((planet) => planet >= 1), 'fromPlanet must name planets from 1'],
    [isNeverFalling(fromPlanet), 'fromPlanet must never lay a tier before the tier below it'],
    [tiers.every((tier) => named.has(tier)), 'every tier must be broken by some charge type'],
    [[...named].every((tier) => tier <= tiers.length), 'breaksGateByType names an unlaid tier'],
    [newestTierLead >= 0, 'newestTierLead must be at least 0'],
  ]
  return checks.filter(([isMet]) => !isMet).map(([, problem]) => problem)
}

function isNeverFalling(planets: readonly number[]): boolean {
  return planets.every((planet, at) => at === 0 || planet >= planets[at - 1])
}

/** A radius the disc stamps from an integer: `2 L_i`, `L_i + L_i`, is whole (TD on #860). */
function isWholeHalfTiles(tiles: BigStat): boolean {
  const halfTiles = add(tiles, tiles)
  return cmp(halfTiles, ceil(halfTiles)) === 0
}

/** Type 1 first, each size the type before it or the next, the last size the last type listed. */
function isTypeLadder({ type, breaksGateByType }: ChargeSizeLadder): boolean {
  const steps = type.slice(1).map((kind, at) => kind - type[at])
  const isStepping = steps.every((step) => step === 0 || step === 1)
  return isStepping && type[0] === 1 && type[type.length - 1] === breaksGateByType.length
}

function isBasisPoints(bp: number): boolean {
  return bp >= 0 && bp <= BASIS_POINTS
}

function isGrowing(radius: ChargeSizeLadder['radius']): boolean {
  return radius.every((tiles, at) => at === 0 || cmp(tiles, radius[at - 1]) > 0)
}
