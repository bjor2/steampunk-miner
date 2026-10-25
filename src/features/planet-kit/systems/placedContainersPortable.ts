/**
 * The placed containers as a save holds them (ticket 823, the TD's final ruling on #823, point 4):
 * saved with the world, keyed on the stable planet id `s:p`, so they survive a save and load and a
 * jump away and back; an old save has none. The portable form is the state's own shape, its
 * cargo's units in their JSON spelling (ticket 849: a safe integer, decimal text past 2^53), so a
 * container a hold up to level 361 filled saves the bytes it did, and reading it back restores the
 * state exactly, as a section's `ofPortable` must. A container's premium ledger counts (ticket 844)
 * are read against its own cargo.
 */
import { portablePremiumLedgerProblems } from '../../../systems/authority/premium/premiumLedgerPortable'
import {
  cargoOfPortable,
  portableCargoOf,
  type PortableCargo,
} from '../../../systems/vehicle/cargoPortable'
import { cargoUnitsOf } from '../../../systems/vehicle/vehicleState'
import { isJsonCount } from '../../../systems/wholeCount'
import {
  CONTAINER_ACCESS,
  type ContainerAccess,
  type PlacedContainer,
  type PlacedContainers,
} from './placedContainers'
import { isPlainMap, isWholeFrom, SNAKE_ID, type Raw } from './planetKitRowShape'

/** `s:p`, both canonical index text, as `corePlanetKeyOf` writes it. */
const PLANET_KEY = /^[1-9][0-9]*:[1-9][0-9]*$/
const TIER_KEY = /^(0|[1-9][0-9]*)$/

/** Why `body` is not a saved set of placed containers; empty when it is. */
export function placedContainersProblems(body: unknown): string[] {
  if (!isPlainMap(body)) return ['placed containers must be an object keyed by s:p']
  return Object.entries(body).flatMap(([key, planet]) => [
    ...(PLANET_KEY.test(key) ? [] : [`placed containers key "${key}" is not a planet's s:p`]),
    ...planetProblems(planet, key),
  ])
}

/** A container as a save holds it: its cargo in the hold's save form. */
export type PortablePlacedContainer = Omit<PlacedContainer, 'cargo'> & { cargo: PortableCargo }

export type PortablePlacedContainers = Readonly<
  Record<
    string,
    { nextContainerId: number; byId: Readonly<Record<string, PortablePlacedContainer>> }
  >
>

export function toPortablePlacedContainers(placed: PlacedContainers): PortablePlacedContainers {
  return mapContainers(placed, (container) => ({
    ...container,
    cargo: portableCargoOf(container.cargo),
  }))
}

/** The containers read back; call only on a body `placedContainersProblems` accepts. */
export function placedContainersOf(body: unknown): PlacedContainers {
  return mapContainers(body as PortablePlacedContainers, (container) => ({
    ...container,
    cargo: cargoOfPortable(container.cargo),
  }))
}

function mapContainers<A, B>(
  placed: Readonly<Record<string, { nextContainerId: number; byId: Readonly<Record<string, A>> }>>,
  convert: (container: A) => B,
): Record<string, { nextContainerId: number; byId: Record<string, B> }> {
  return Object.fromEntries(
    Object.entries(placed).map(([key, planet]) => [
      key,
      {
        nextContainerId: planet.nextContainerId,
        byId: Object.fromEntries(
          Object.entries(planet.byId).map(([id, container]) => [id, convert(container)]),
        ),
      },
    ]),
  )
}

function planetProblems(planet: unknown, key: string): string[] {
  if (!isPlainMap(planet)) return [`${key} must be { nextContainerId, byId }`]
  const where = `${key}.byId`
  return [
    ...(isWholeFrom(planet.nextContainerId, 1) ? [] : [`${key}.nextContainerId must be from 1`]),
    ...(isPlainMap(planet.byId) && Object.keys(planet.byId).length > 0
      ? byIdProblems(planet.byId, planet.nextContainerId, where)
      : [`${where} must hold at least one container`]),
    ...unknownFields(planet, key, ['nextContainerId', 'byId']),
  ]
}

function byIdProblems(byId: Raw, nextId: unknown, where: string): string[] {
  return Object.entries(byId).flatMap(([id, container]) => [
    ...containerProblems(container, `${where}.${id}`),
    ...(isPlainMap(container) && String(container.containerId) === id
      ? []
      : [`${where}.${id} is not keyed by its containerId`]),
    ...(isPlainMap(container) && isBelow(container.containerId, nextId)
      ? []
      : [`${where}.${id} is not below nextContainerId`]),
  ])
}

function isBelow(containerId: unknown, nextId: unknown): boolean {
  return isWholeFrom(containerId, 1) && isWholeFrom(nextId, 1) && containerId < nextId
}

function containerProblems(container: unknown, where: string): string[] {
  if (!isPlainMap(container)) return [`${where} must be a placed container`]
  return [
    ...(isWholeFrom(container.containerId, 1) ? [] : [`${where}.containerId must be from 1`]),
    ...(SNAKE_ID.test(String(container.kind)) ? [] : [`${where}.kind must be a snake_case kind`]),
    ...(typeof container.ownerId === 'string' && container.ownerId !== ''
      ? []
      : [`${where}.ownerId must be a player id`]),
    ...(CONTAINER_ACCESS.includes(container.access as ContainerAccess)
      ? []
      : [`${where}.access must be one of ${CONTAINER_ACCESS.join(', ')}`]),
    ...cellProblems(container.cell, `${where}.cell`),
    ...cargoProblems(container.cargo, `${where}.cargo`),
    ...premiumProblems(container, `${where}.premium`),
    ...unknownFields(container, where, CONTAINER_FIELDS),
  ]
}

const CONTAINER_FIELDS: readonly (keyof PlacedContainer)[] = [
  'containerId',
  'kind',
  'ownerId',
  'access',
  'cell',
  'cargo',
  'premium',
]

/** The premium counts (ticket 844) read against the container's cargo once that cargo reads. */
function premiumProblems(container: Raw, where: string): string[] {
  if (cargoProblems(container.cargo, where).length > 0) return []
  return portablePremiumLedgerProblems(
    container.premium,
    cargoOfPortable(container.cargo as unknown as PortableCargo),
    where,
  )
}

function cellProblems(cell: unknown, where: string): string[] {
  const isCell = isPlainMap(cell) && Number.isSafeInteger(cell.tx) && Number.isSafeInteger(cell.ty)
  return isCell && Object.keys(cell).length === 2 ? [] : [`${where} must be { tx, ty } integers`]
}

function cargoProblems(cargo: unknown, where: string): string[] {
  if (!isPlainMap(cargo) || !isPlainMap(cargo.ore))
    return [`${where} must be { ore, coreFragments }`]
  const ore = Object.entries(cargo.ore).flatMap(([tier, units]) =>
    TIER_KEY.test(tier) && isJsonCount(units) && units !== 0
      ? []
      : [`${where}.ore.${tier} must be units from 1`],
  )
  const fragments = isWholeFrom(cargo.coreFragments, 0)
    ? []
    : [`${where}.coreFragments must be a whole number`]
  const problems = [...ore, ...fragments, ...unknownFields(cargo, where, ['ore', 'coreFragments'])]
  return problems.length === 0 &&
    cargoUnitsOf(cargoOfPortable(cargo as unknown as PortableCargo)) === 0n
    ? [`${where} is empty, so the container should have been removed`]
    : problems
}

function unknownFields(map: Raw, where: string, fields: readonly string[]): string[] {
  return Object.keys(map)
    .filter((field) => !fields.includes(field))
    .map((field) => `${where}.${field} is not a field of a placed container`)
}
