/**
 * The named conditions the hint table (#16) shows and dismisses its plaques on: each a pure
 * question about one moment of the run, the authority state after a batch of domain events and
 * the events themselves. The data file names them; nothing here knows which plaque uses which.
 */
import { vehicleOf, type AuthorityState } from '../authority/authorityState'
import type { DomainEvent, DomainEventBodies, DomainEventType } from '../authority/domainEvent'
import { dockSiteOfPlanet } from '../authority/planetOfState'
import { isInPadZone, isPoseStationary, tileOfPose } from '../vehicle/vehiclePose'
import { isVehicleActive } from '../vehicle/vehicleState'

/** What the hint boards look at: the state after a batch of events, and that batch. */
export interface HintMoment {
  state: AuthorityState
  playerId: string
  events: readonly DomainEvent[]
}

export type HintCondition = (moment: HintMoment) => boolean

/** The planet whose arrival has its own transmission (#2 narrative stubs). */
const SECOND_PLANET = 2

export const HINT_CONDITIONS = {
  /** True at the first moment a board sees; the boards start watching when the run starts. */
  runStarted: () => true,
  leftPadZone: isOutsidePadZone,
  vehicleMoved: hasLeftDockPoint,
  tileDestroyed: (moment) => hasPlayerEvent(moment, 'TileDestroyed'),
  resourceCollected: (moment) => hasPlayerEvent(moment, 'CargoAdded'),
  docked: (moment) => hasPlayerEvent(moment, 'DockEntered'),
  dockedWithCargo: (moment) =>
    playerEventsOf(moment, 'DockEntered').some((event) => event.cargoUnits > 0),
  upgradeBought: (moment) => hasPlayerEvent(moment, 'UpgradePurchased'),
  energyLowOrRescued: (moment) =>
    hasPlayerEvent(moment, 'EnergyLow') || hasPlayerEvent(moment, 'RescueTriggered'),
  coreReached: (moment) => hasPlayerEvent(moment, 'CoreReached'),
  enteredPlanetTwo: (moment) =>
    hasPlayerEvent(moment, 'PlanetEntered') && moment.state.planet.index === SECOND_PLANET,
} satisfies Record<string, HintCondition>

export type HintConditionName = keyof typeof HINT_CONDITIONS

export function isHintConditionName(name: unknown): name is HintConditionName {
  return typeof name === 'string' && Object.hasOwn(HINT_CONDITIONS, name)
}

/** The fee and the cargo a tow in this moment cost (#16: the energy hint says so). */
export interface RescueCost {
  fee: string
  cargoLostValue: string
}

export function rescueCostIn(moment: HintMoment): RescueCost | null {
  const rescue = playerEventsOf(moment, 'RescueTriggered').at(-1)
  return rescue === undefined ? null : { fee: rescue.fee, cargoLostValue: rescue.cargoLostValue }
}

function isOutsidePadZone({ state, playerId }: HintMoment): boolean {
  const vehicle = vehicleOf(state, playerId)
  const site = dockSiteOfPlanet(state.planet)
  if (site === null || vehicle.pose === null || !isVehicleActive(vehicle)) return false
  return !isInPadZone(site, vehicle.pose)
}

/** A run starts at rest on the dock point; driving off it or speeding up is the first movement. */
function hasLeftDockPoint({ state, playerId }: HintMoment): boolean {
  const pose = vehicleOf(state, playerId).pose
  const site = dockSiteOfPlanet(state.planet)
  if (site === null || pose === null) return false
  const tile = tileOfPose(pose)
  const isOnDockPoint = tile.tx === site.dockPoint.tx && tile.ty === site.dockPoint.ty
  return !isOnDockPoint || !isPoseStationary(pose)
}

function hasPlayerEvent(moment: HintMoment, type: DomainEventType): boolean {
  return playerEventsOf(moment, type).length > 0
}

/** Events of one type that happened to this player, or to nobody in particular (the clock's). */
function playerEventsOf<T extends DomainEventType>(
  moment: HintMoment,
  type: T,
): Array<{ type: T } & DomainEventBodies[T]> {
  return moment.events.filter(
    (event): event is DomainEvent & { type: T } & DomainEventBodies[T] =>
      event.type === type && (event.playerId ?? moment.playerId) === moment.playerId,
  )
}
