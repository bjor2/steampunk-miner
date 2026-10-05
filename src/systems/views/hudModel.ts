/**
 * `selectHudModel` (#33 section 5): the in-run HUD as a pure function of the authority replica,
 * the client-owned depth and the local bindings. Every element the HUD draws is a field here, so
 * the debug API and specs read the HUD without pixels. Money is not on the HUD; the cargo value
 * is, at the shop's prices, with core fragments excluded (they are never sold, #10).
 */
import { ENERGY_QUANTA_PER_UNIT } from '../../constants/balance'
import type { AuthorityState } from '../authority/authorityState'
import { canOpenArtefactCache } from '../authority/artefactRules'
import { dockableBayOf } from '../authority/dockRules'
import { BAY_NAMES } from './bayNames'
import { serviceQuote } from '../authority/platformServices'
import { formatAmount } from '../displayAmount'
import { boundLabel, type Bindings } from '../input/actionMap'
import {
  cmp,
  div,
  floor,
  fromSafeInteger,
  mul,
  toCanonical,
  toSafeInteger,
  type Money,
} from '../money'
import { cargoGaugeText, energyGaugeText, hullGaugeText } from '../vehicle/vehicleReadout'
import {
  cargoUnitsOf,
  energyMaxQuantaOf,
  statsOfVehicle,
  type VehicleState,
} from '../vehicle/vehicleState'
import { energyWarningLevel, type EnergyWarningLevel } from './energyWarning'
import {
  coreDistanceOf,
  depthReadingOf,
  dockArrowOf,
  vehicleStateReadingOf,
  type DepthReading,
  type DockArrow,
  type VehicleStateReading,
} from './hudReadings'
import { threatMarkersOf, type ThreatMarker } from './threatMarkers'
import { tileTimeAhead, type TileTime } from './tileTime'
import { amountReading, type AmountReading } from './viewParts'
import { returnReserveUnits } from '../vehicle/returnReserve'

export interface HudSources {
  state: AuthorityState
  playerId: string
  /** Client-owned whole tiles below the surface, the log envelope's `depthTiles`. */
  depthTiles: number
  bindings: Bindings
}

/** A gauge: the text, the exact canonical value (`data-exact`) and the needle in 0..1000. */
export interface GaugeReading {
  text: string
  exact: string
  permille: number
}

export interface CargoReading extends GaugeReading {
  coreFragments: number
  coreText: string
  isFull: boolean
}

export interface EnergyWarning {
  level: EnergyWarningLevel
  text: string
  /** Icon id: the warning never relies on colour (#33 section 7). */
  icon: string
  returnReserveUnits: number
}

export interface DockPrompt {
  isShown: boolean
  text: string
}

export interface HudModel {
  energy: GaugeReading
  hull: GaugeReading
  cargo: CargoReading
  cargoValue: AmountReading
  depth: DepthReading
  dockArrow: DockArrow | null
  coreDistance: number | null
  threats: ThreatMarker[]
  tileTime: TileTime
  vehicleState: VehicleStateReading
  dockPrompt: DockPrompt
  /** "E: Ancient cache" exactly while `interact` would open a live cache (#46). */
  cachePrompt: DockPrompt
  isDebugRun: boolean
  warning: EnergyWarning
}

const WARNING_MARKERS: Readonly<Record<EnergyWarningLevel, { text: string; icon: string }>> = {
  ok: { text: '', icon: 'none' },
  low: { text: 'LOW ENERGY: head for the platform', icon: 'gauge-hatched' },
  critical: { text: 'CRITICAL ENERGY: climb home now', icon: 'gauge-hatched-double' },
}

const PERMILLE = 1000

export function selectHudModel(sources: HudSources): HudModel {
  const { state, playerId } = sources
  const vehicle = state.players[playerId].vehicle
  return {
    energy: energyGaugeOf(vehicle),
    hull: hullGaugeOf(vehicle),
    cargo: cargoGaugeOf(vehicle),
    cargoValue: amountReading(serviceQuote(state, playerId).saleValue),
    depth: depthReadingOf(state, playerId, sources.depthTiles),
    dockArrow: dockArrowOf(state, playerId),
    coreDistance: coreDistanceOf(state, playerId),
    threats: threatMarkersOf(state, playerId),
    tileTime: tileTimeAhead(state, playerId),
    vehicleState: vehicleStateReadingOf(vehicle, state.tick),
    dockPrompt: dockPromptOf(state, playerId, sources.bindings),
    cachePrompt: cachePromptOf(state, playerId, sources.bindings),
    isDebugRun: state.debugApplied,
    warning: energyWarningOf(vehicle, sources.depthTiles),
  }
}

/** Every warning level's marker, for the accessibility check (#33 acceptance 10). */
export function energyWarningMarkers(): Readonly<
  Record<EnergyWarningLevel, { text: string; icon: string }>
> {
  return WARNING_MARKERS
}

function energyGaugeOf(vehicle: VehicleState): GaugeReading {
  const maxQuanta = energyMaxQuantaOf(vehicle)
  return {
    text: energyGaugeText(vehicle.energy, maxQuanta),
    exact: toCanonical(
      div(fromSafeInteger(vehicle.energy), fromSafeInteger(ENERGY_QUANTA_PER_UNIT)),
    ),
    permille: Math.floor((vehicle.energy * PERMILLE) / maxQuanta),
  }
}

function hullGaugeOf(vehicle: VehicleState): GaugeReading {
  const hullMax = statsOfVehicle(vehicle).hullMax
  return {
    text: hullGaugeText(vehicle.hull, hullMax),
    exact: toCanonical(vehicle.hull),
    permille: permilleOf(vehicle.hull, hullMax),
  }
}

function cargoGaugeOf(vehicle: VehicleState): CargoReading {
  const units = cargoUnitsOf(vehicle.cargo)
  const capacity = statsOfVehicle(vehicle).cargoCapacity
  const { coreFragments } = vehicle.cargo
  return {
    text: cargoGaugeText(units, capacity),
    exact: String(units),
    permille: Math.floor((Math.min(units, capacity) * PERMILLE) / capacity),
    coreFragments,
    coreText: coreFragments > 0 ? `(${formatAmount(coreFragments)} core)` : '',
    isFull: units >= capacity,
  }
}

function energyWarningOf(vehicle: VehicleState, depthTiles: number): EnergyWarning {
  const speedMax = statsOfVehicle(vehicle).engine.speedMax
  const level = energyWarningLevel({
    energyQuanta: vehicle.energy,
    energyMaxQuanta: energyMaxQuantaOf(vehicle),
    depthTiles,
    speedMax,
  })
  return {
    level,
    ...WARNING_MARKERS[level],
    returnReserveUnits: returnReserveUnits(depthTiles, speedMax),
  }
}

/** The prompt names the bay the vehicle would dock at (#37). */
function dockPromptOf(state: AuthorityState, playerId: string, bindings: Bindings): DockPrompt {
  const bay = dockableBayOf(state, playerId)
  const label = boundLabel(bindings, 'interact')
  return {
    isShown: bay !== null,
    text: bay === null ? '' : `${label}: Dock at the ${BAY_NAMES[bay]}`,
  }
}

function cachePromptOf(state: AuthorityState, playerId: string, bindings: Bindings): DockPrompt {
  return {
    isShown: canOpenArtefactCache(state, playerId),
    text: `${boundLabel(bindings, 'interact')}: Ancient cache`,
  }
}

/** A BigStat ratio as a whole number of thousandths, at most 1000; display only. */
function permilleOf(value: Money, max: Money): number {
  if (cmp(value, max) >= 0) return PERMILLE
  return toSafeInteger(floor(div(mul(value, fromSafeInteger(PERMILLE)), max)))
}
