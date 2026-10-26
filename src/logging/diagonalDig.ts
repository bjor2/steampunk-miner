/**
 * What a bot run cut and what its lining was billed, per planet (ticket 899), folded from its
 * commands and steps beside the pacing tallies, derived from the log and never written into it
 * (#11 section 3):
 *
 * - **cut**: each tile a `drillTile` broke, as the length of tunnel its cut ran along the aim the
 *   vehicle last reported: a metre along the four facings, √2 m at 45° (a metre of depth). The
 *   45° share of that length is the diagonal-heavy run's bar (at least half);
 * - **billed**: the tunnel axis every `CasingLined` billed, and whether each was priced by the
 *   per-metre lining rule for its band, length and type alone, with no term for the angle (#833,
 *   the HS's condition 1).
 */
import { MM_PER_METRE } from '../constants/physics'
import type { AuthorityCommand } from '../systems/authority/authorityCommand'
import type { AuthorityState } from '../systems/authority/authorityState'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { casingLiningPrice } from '../systems/economy/casingPrices'
import { div, fromSafeInteger, toCanonical } from '../systems/money'
import { aimOfPose, type Aim } from '../systems/vehicle/aim'
import type { TilePoint } from '../systems/world/tileGrid'

/** One planet's cut and its lining bill. */
export interface PlanetDig {
  planet: number
  /** Metres of tunnel cut along the four facings or any aim but 45°. */
  otherCutMetres: number
  /** Metres of tunnel cut at 45°: √2 m a tile. */
  diagonalCutMetres: number
  /** Tiles cut at 45°: the depth that cut went down or up, in metres. */
  diagonalTiles: number
  /** Tunnel axis the lining billed, mm. */
  billedMm: number
  /** Rings billed at a price the per-metre rule does not give: an angle term, if any. */
  offRulePrices: number
}

export interface DigTally {
  planets: Map<number, PlanetDig>
  /** The tile the last `drillTile` sent bores, until its step is folded. */
  boredTile: TilePoint | null
}

const DIAGONAL_TILE_METRES = Math.SQRT2
/** Aims between two facings: 8, 24, 40 and 56 of the 64 a turn. */
const QUARTER_TURN_AIMS = 16
const EIGHTH_TURN_AIMS = 8

export function emptyDigTally(): DigTally {
  return { planets: new Map(), boredTile: null }
}

/** One command the bot sent: a `drillTile` names the tile its step may break. */
export function tallyDigCommand(tally: DigTally, command: AuthorityCommand): void {
  tally.boredTile =
    command.type === 'drillTile' ? { tx: command.payload.tx, ty: command.payload.ty } : null
}

/** One bot step: the state after it and the events it answered, folded in place. */
export function tallyDigStep(
  tally: DigTally,
  state: AuthorityState,
  playerId: string,
  events: readonly DomainEvent[],
): void {
  const planet = planetDigOf(tally, state.planet.index)
  if (isBoredTileBroken(tally, events)) tallyCut(planet, aimOfVehicle(state, playerId))
  events.forEach((event) => tallyLining(planet, event))
  tally.boredTile = null
}

/** The share of the planet's cut length that ran at 45°, in basis points; null with no cut. */
export function diagonalShareBpOf(dig: PlanetDig): number | null {
  const total = dig.otherCutMetres + dig.diagonalCutMetres
  return total === 0 ? null : Math.floor((dig.diagonalCutMetres * 10000) / total)
}

/** Lining billed per metre cut; null with no cut. */
export function billedPerCutMetreOf(dig: PlanetDig): number | null {
  const total = dig.otherCutMetres + dig.diagonalCutMetres
  return total === 0 ? null : dig.billedMm / MM_PER_METRE / total
}

export function isDiagonalAim(aim: Aim): boolean {
  return aim % QUARTER_TURN_AIMS === EIGHTH_TURN_AIMS
}

function planetDigOf(tally: DigTally, planet: number): PlanetDig {
  const known = tally.planets.get(planet)
  if (known !== undefined) return known
  const fresh: PlanetDig = {
    planet,
    otherCutMetres: 0,
    diagonalCutMetres: 0,
    diagonalTiles: 0,
    billedMm: 0,
    offRulePrices: 0,
  }
  tally.planets.set(planet, fresh)
  return fresh
}

function isBoredTileBroken(tally: DigTally, events: readonly DomainEvent[]): boolean {
  const tile = tally.boredTile
  if (tile === null) return false
  return events.some(
    (event) => event.type === 'TileDestroyed' && event.tx === tile.tx && event.ty === tile.ty,
  )
}

function aimOfVehicle(state: AuthorityState, playerId: string): Aim | null {
  const { pose } = state.players[playerId].vehicle
  return pose === null ? null : aimOfPose(pose)
}

function tallyCut(planet: PlanetDig, aim: Aim | null): void {
  if (aim === null || !isDiagonalAim(aim)) {
    planet.otherCutMetres += 1
    return
  }
  planet.diagonalCutMetres += DIAGONAL_TILE_METRES
  planet.diagonalTiles += 1
}

function tallyLining(planet: PlanetDig, event: DomainEvent): void {
  if (event.type !== 'CasingLined') return
  planet.billedMm += event.lengthMm
  if (event.price !== perMetreRulePriceOf(planet.planet, event)) planet.offRulePrices += 1
}

/** What the per-metre lining rule bills a ring of this band, length and type (#76, #894). */
function perMetreRulePriceOf(
  planetIndex: number,
  { band, lengthMm, liningType }: Extract<DomainEvent, { type: 'CasingLined' }>,
): string {
  const metres = div(fromSafeInteger(lengthMm), fromSafeInteger(MM_PER_METRE))
  return toCanonical(casingLiningPrice(planetIndex, band, metres, liningType))
}
