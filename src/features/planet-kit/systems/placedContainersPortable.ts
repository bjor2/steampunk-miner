/**
 * The placed containers as a save holds them (ticket 823, the TD's final ruling on #823, point 4):
 * saved with the world, keyed on the stable planet id `s:p`, so they survive a save and load and a
 * jump away and back; an old save has none. The portable form is the state's own shape (integers
 * and strings only), so reading it back is the identity a section's `ofPortable` must be.
 */
import { cargoUnitsOf, type Cargo } from '../../../systems/vehicle/vehicleState'
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

export function toPortablePlacedContainers(placed: PlacedContainers): PlacedContainers {
  return placed
}

/** The containers typed; call only on a body `placedContainersProblems` accepts. */
export function placedContainersOf(body: unknown): PlacedContainers {
  return body as PlacedContainers
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
]

function cellProblems(cell: unknown, where: string): string[] {
  const isCell = isPlainMap(cell) && Number.isSafeInteger(cell.tx) && Number.isSafeInteger(cell.ty)
  return isCell && Object.keys(cell).length === 2 ? [] : [`${where} must be { tx, ty } integers`]
}

function cargoProblems(cargo: unknown, where: string): string[] {
  if (!isPlainMap(cargo) || !isPlainMap(cargo.ore))
    return [`${where} must be { ore, coreFragments }`]
  const ore = Object.entries(cargo.ore).flatMap(([tier, units]) =>
    TIER_KEY.test(tier) && isWholeFrom(units, 1)
      ? []
      : [`${where}.ore.${tier} must be units from 1`],
  )
  const fragments = isWholeFrom(cargo.coreFragments, 0)
    ? []
    : [`${where}.coreFragments must be a whole number`]
  const problems = [...ore, ...fragments, ...unknownFields(cargo, where, ['ore', 'coreFragments'])]
  return problems.length === 0 && cargoUnitsOf(cargo as unknown as Cargo) === 0
    ? [`${where} is empty, so the container should have been removed`]
    : problems
}

function unknownFields(map: Raw, where: string, fields: readonly string[]): string[] {
  return Object.keys(map)
    .filter((field) => !fields.includes(field))
    .map((field) => `${where}.${field} is not a field of a placed container`)
}
