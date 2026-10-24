/**
 * The star map's controls (ticket 793; the GD lock on #650, Map UX: "a jump takes at most 2 s from
 * confirming to control"): each planet's Jump, armed by the first press and sent by the second,
 * with a Buy fuel for its shortfall while docked at the Sell bay that sells fuel; the tank's next
 * level and the jump drive at that same bay (`fuelTankRules.ts`, `jumpDriveRules.ts`); and on the
 * system's last planet, once the drive is fitted, the jump to the next system. Every button
 * carries the command it submits and the reason the authority would refuse it now, so a jump the
 * tank cannot fuel is refused on the screen and sends nothing. The commands are the host's own
 * (`jumpToPlanet`, `buyFuel`, `buyFuelTank`, `buyJumpDrive`): no rule here decides anything.
 *
 * The buttons are a menu's (`focusStops`, `buttons`), so a key or a pad moves through them as through
 * a bay's, and a click or a tap presses the same store action.
 */
import { refusalOfIntent } from '../authority/applyCommand'
import { vehicleOf, type AuthorityState } from '../authority/authorityState'
import type { CommandIntent } from '../authority/authorityCommand'
import { dockedBayOf } from '../authority/dockRules'
import { systemOfPlanet } from '../authority/planetOfState'
import { nextFuelTankPriceOf } from '../authority/starMap/fuelTankRules'
import { jumpFuelTo, type JumpTarget } from '../authority/starMap/jumpRules'
import { ECONOMY } from '../economy/economy'
import { jumpDrivePrice } from '../economy/systemJump'
import { cmp, sub, toSafeInteger, ZERO_MONEY } from '../money'
import {
  buyFuelCommand,
  buyFuelTankCommand,
  buyJumpDriveCommand,
  jumpToPlanetCommand,
} from '../platform/platformCommands'
import { placeOfCampaign } from '../starMap/campaignIndex'
import { fuelOf } from '../vehicle/vehicleFuel'
import { hasJumpDrive } from '../vehicle/vehicleJumpDrive'
import type { FocusStop } from './menuFocus'
import { starMapPlacesOf } from './starMapView'
import { priceReading, type AmountReading, type ScreenButton } from './viewParts'

/** The UI state the controls read besides the authority: the Jump whose first press armed it. */
export interface StarMapUiState {
  armedJumpId: string | null
}

/** A jump's two controls: the Jump itself and the fuel its tank lacks, where that fuel is sold. */
export interface JumpControls {
  jump: ScreenButton
  /** Armed by a first press: the next press sends the jump. */
  isArmed: boolean
  /** Docked at the Sell bay with the tank short of the jump's fuel; null otherwise. */
  buyFuel: ScreenButton | null
}

/** A purchase drawn with its price beside its button. */
export interface StarMapPurchase {
  button: ScreenButton
  price: AmountReading
}

export interface StarMapControls {
  /** One per planet of the map that is not the one the session is on, by place. */
  planets: Array<JumpControls & { place: number }>
  /** The tank's next level, at the Sell bay; null elsewhere. */
  buyTank: StarMapPurchase | null
  /** The jump drive, at the Sell bay until it is fitted; null elsewhere and after. */
  buyDrive: StarMapPurchase | null
  /** On the system's last planet with the drive fitted: the jump to the next system's first. */
  jumpOut: JumpControls | null
  focusStops: FocusStop[]
  buttons: ScreenButton[]
}

/** The star map's panel among a screen's focus stops. */
export const STAR_MAP_FOCUS_PANEL = 'starMap'
export const STAR_MAP_BUY_TANK_ID = 'star-map-buy-tank'
export const STAR_MAP_BUY_DRIVE_ID = 'star-map-buy-drive'
export const STAR_MAP_JUMP_OUT_ID = 'star-map-jump-out'
export const STAR_MAP_JUMP_OUT_FUEL_ID = 'star-map-jump-out-fuel'

/** A planet's Jump on the map, by its place in the system. */
export function starMapJumpIdOf(place: number): string {
  return `star-map-jump-${place}`
}

/** A planet's Buy fuel on the map, by its place in the system. */
export function starMapBuyFuelIdOf(place: number): string {
  return `star-map-buy-fuel-${place}`
}

const LAST_PLACE = BigInt(ECONOMY.starMap.planetsPerSystem)

/** The controls for the map's rows (`starMapPlacesOf`), as they would act now. */
export function starMapControlsOf(
  state: AuthorityState,
  playerId: string,
  ui: StarMapUiState,
): StarMapControls {
  const isAtFuelBay = dockedBayOf(state, playerId) === 'sell'
  const controls = {
    planets: planetJumpsOf(state, playerId, starMapPlacesOf(state.planet), { ...ui, isAtFuelBay }),
    buyTank: isAtFuelBay ? buyTankOf(state, playerId) : null,
    buyDrive: isAtFuelBay ? buyDriveOf(state, playerId) : null,
    jumpOut: jumpOutOf(state, playerId, { ...ui, isAtFuelBay }),
  }
  return { ...controls, ...menuOf(controls) }
}

interface JumpUiState extends StarMapUiState {
  isAtFuelBay: boolean
}

/** Every place but the one the session is on, which has nowhere to jump. */
function planetJumpsOf(
  state: AuthorityState,
  playerId: string,
  places: readonly number[],
  ui: JumpUiState,
): StarMapControls['planets'] {
  const system = systemOfPlanet(state.planet)
  return places
    .filter((place) => BigInt(place) !== placeOfSession(state))
    .map((place) => ({
      place,
      ...jumpControlsOf(state, playerId, { system, planet: BigInt(place) }, ui, {
        jumpId: starMapJumpIdOf(place),
        buyFuelId: starMapBuyFuelIdOf(place),
      }),
    }))
}

function placeOfSession(state: AuthorityState): bigint {
  return placeOfCampaign(systemOfPlanet(state.planet), BigInt(state.planet.index))
}

function jumpOutOf(state: AuthorityState, playerId: string, ui: JumpUiState): JumpControls | null {
  if (!isJumpOutOpen(state, playerId)) return null
  const target = { system: systemOfPlanet(state.planet) + 1n, planet: 1n }
  return jumpControlsOf(state, playerId, target, ui, {
    jumpId: STAR_MAP_JUMP_OUT_ID,
    buyFuelId: STAR_MAP_JUMP_OUT_FUEL_ID,
  })
}

/** The way out of a system is from its last planet, and only with the drive fitted (ticket 759). */
function isJumpOutOpen(state: AuthorityState, playerId: string): boolean {
  return placeOfSession(state) === LAST_PLACE && hasJumpDrive(vehicleOf(state, playerId))
}

function jumpControlsOf(
  state: AuthorityState,
  playerId: string,
  target: JumpTarget,
  ui: JumpUiState,
  ids: { jumpId: string; buyFuelId: string },
): JumpControls {
  const lacking = fuelLackingFor(state, playerId, target)
  const isArmed = ui.armedJumpId === ids.jumpId
  return {
    jump: jumpButtonOf(state, playerId, target, { id: ids.jumpId, isArmed, lacking }),
    isArmed,
    buyFuel:
      ui.isAtFuelBay && lacking > 0 ? buyFuelOf(state, playerId, ids.buyFuelId, lacking) : null,
  }
}

/** Whole fuel units the tank lacks for the jump to `target`; 0 when it holds them. */
function fuelLackingFor(state: AuthorityState, playerId: string, target: JumpTarget): number {
  const lacking = sub(jumpFuelTo(state, target), fuelOf(vehicleOf(state, playerId)))
  return cmp(lacking, ZERO_MONEY) > 0 ? toSafeInteger(lacking) : 0
}

/** The first press arms the jump and sends nothing; only the armed button sends `jumpToPlanet`. */
function jumpButtonOf(
  state: AuthorityState,
  playerId: string,
  target: JumpTarget,
  jump: { id: string; isArmed: boolean; lacking: number },
): ScreenButton {
  const intent = jumpToPlanetCommand(target.system, target.planet)
  return {
    id: jump.id,
    label: jumpLabelOf(jump.isArmed, jump.lacking),
    action: jump.isArmed ? { kind: 'submit', intent } : { kind: 'armJump' },
    reason: reasonOf(state, playerId, intent),
  }
}

function jumpLabelOf(isArmed: boolean, lacking: number): string {
  if (isArmed) return 'Confirm jump'
  return lacking > 0 ? `Jump, short ${lacking} fuel` : 'Jump'
}

function buyFuelOf(
  state: AuthorityState,
  playerId: string,
  id: string,
  lacking: number,
): ScreenButton {
  return submitButtonOf(state, playerId, id, `Buy ${lacking} fuel`, buyFuelCommand(lacking))
}

function buyTankOf(state: AuthorityState, playerId: string): StarMapPurchase {
  return {
    button: submitButtonOf(
      state,
      playerId,
      STAR_MAP_BUY_TANK_ID,
      'Bigger tank',
      buyFuelTankCommand(),
    ),
    price: priceReading(nextFuelTankPriceOf(state, playerId)),
  }
}

function buyDriveOf(state: AuthorityState, playerId: string): StarMapPurchase | null {
  if (hasJumpDrive(vehicleOf(state, playerId))) return null
  return {
    button: submitButtonOf(
      state,
      playerId,
      STAR_MAP_BUY_DRIVE_ID,
      'Jump drive',
      buyJumpDriveCommand(),
    ),
    price: priceReading(jumpDrivePrice()),
  }
}

function submitButtonOf(
  state: AuthorityState,
  playerId: string,
  id: string,
  label: string,
  intent: CommandIntent,
): ScreenButton {
  return {
    id,
    label,
    action: { kind: 'submit', intent },
    reason: reasonOf(state, playerId, intent),
  }
}

function reasonOf(state: AuthorityState, playerId: string, intent: CommandIntent) {
  return refusalOfIntent(state, playerId, intent)?.reason ?? null
}

/** The buttons in reading order: the bay's purchases, each planet's fuel then Jump, the way out. */
function menuOf(controls: Omit<StarMapControls, 'focusStops' | 'buttons'>) {
  const buttons = [
    ...[controls.buyTank, controls.buyDrive].flatMap((purchase) => purchase?.button ?? []),
    ...[...controls.planets, controls.jumpOut].flatMap(jumpButtonsOf),
  ]
  return { buttons, focusStops: buttons.map(focusStopOf) }
}

function jumpButtonsOf(controls: JumpControls | null): ScreenButton[] {
  if (controls === null) return []
  return controls.buyFuel === null ? [controls.jump] : [controls.buyFuel, controls.jump]
}

function focusStopOf(button: ScreenButton): FocusStop {
  return { id: button.id, panel: STAR_MAP_FOCUS_PANEL }
}
