/**
 * What a planet's card says of its class (GD lock on spec #258, Q1 "On screen"; ticket 293): the
 * class tag and the arrival line in the #159 ledger voice, from `planetCards.json`, keyed on the
 * class `planetClassOf` answers, so endless follows its act and P30's relic wins over Lodestone. A
 * planet with no class, or a class with no card entry, shows neither. Text only: the card surface
 * that draws it reads it here.
 */
import cardsFile from '../planetCards.json'
import { planetClassOf } from './planetClass'
import { PLANET_CLASSES, type PlanetClass } from './planetClassRows'

export interface PlanetClassCard {
  planetClass: PlanetClass
  /** The tag on the planet card, as "Magnetic". */
  tag: string
  /** The line the card reads on arrival. */
  arrivalLine: string
}

type ClassCards = Readonly<Partial<Record<PlanetClass, Omit<PlanetClassCard, 'planetClass'>>>>

type Raw = Record<string, unknown>

export const PLANET_CLASS_CARDS: ClassCards = loadClassCards(cardsFile)

/** The planet's class card; null where the planet shows no class. */
export function planetClassCardOf(planetIndex: number): PlanetClassCard | null {
  const planetClass = planetClassOf(planetIndex)
  const card = planetClass === null ? undefined : PLANET_CLASS_CARDS[planetClass]
  return planetClass === null || card === undefined ? null : { planetClass, ...card }
}

/** Why the file is not a class-card table; empty when it is. */
export function planetCardProblems(file: unknown): string[] {
  const entries = Object.entries(((file as Raw).byClass ?? {}) as Raw)
  return [
    ...entries
      .filter(([planetClass]) => !(PLANET_CLASSES as readonly string[]).includes(planetClass))
      .map(([planetClass]) => `byClass names "${planetClass}", which is no planet class`),
    ...entries
      .filter(([, card]) => !isCardText(card))
      .map(([planetClass]) => `byClass.${planetClass} needs a tag and an arrivalLine`),
  ]
}

function loadClassCards(file: typeof cardsFile): ClassCards {
  const problems = planetCardProblems(file)
  if (problems.length > 0)
    throw new Error(`The planet-mix card data is refused:\n${problems.join('\n')}`)
  return file.byClass
}

function isCardText(card: unknown): boolean {
  const { tag, arrivalLine } = (card ?? {}) as Raw
  return isText(tag) && isText(arrivalLine)
}

function isText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}
