/**
 * The travel card as it draws (decisions #8 and #10, on brass since ticket 885): the title, one
 * line, and the destination's name and surface gravity as icon-plus-value facts, the gravity
 * through the shared formatter (#681, `planetGravityTraitOf`). No planet number shows bare: the
 * planets go by their display names (#702), and the leg from one to the other sits in the tooltip.
 * Display only.
 */
import { hudLabelIconIdOf } from '../art/icons/iconSet'
import { planetDisplayNameOf } from '../registries/planetRow'
import type { TravelTransition } from '../sliceProgress'
import { planetGravityTraitOf } from './localGravityReading'
import type { UiTextUnderTitle } from './uiText'

export interface TravelCardFact {
  iconId: string
  text: string
  /** The canonical amount behind a shortened value. */
  exact?: string
  testId: string
}

export interface TravelCardView {
  /** Kept word for word: the specs wait on it to know control is back (`starMapJumps.ts`). */
  title: string
  iconId: string
  heading: UiTextUnderTitle
  facts: readonly TravelCardFact[]
}

export const TRAVEL_CARD_TEXT_ID = 'travel-card'

/** The card's root, the hook the specs find it by. */
export const TRAVEL_CARD_TEST_ID = 'travel-card'

/** The facts' hooks: the destination's name and its gravity. */
export const TRAVEL_CARD_FACT_IDS = {
  destination: 'travel-card-destination',
  gravity: 'travel-card-gravity',
} as const

const TITLE = 'Core drive engaged'
const ONE_LINE = 'Hold fast while the rig crosses the void.'
const STAR_MAP_ICON_ID = hudLabelIconIdOf('star_map')
const PLANET_ICON_ID = hudLabelIconIdOf('planet')

export function travelCardViewOf(transition: TravelTransition): TravelCardView {
  return {
    title: TITLE,
    iconId: STAR_MAP_ICON_ID,
    heading: { id: TRAVEL_CARD_TEXT_ID, oneLine: ONE_LINE, tooltipLines: [legLineOf(transition)] },
    facts: [destinationFactOf(transition.toPlanet), gravityFactOf(transition.toPlanet)],
  }
}

function legLineOf({ fromPlanet, toPlanet }: TravelTransition): string {
  return `Leaving ${planetDisplayNameOf(fromPlanet)} for ${planetDisplayNameOf(toPlanet)}.`
}

function destinationFactOf(planetIndex: number): TravelCardFact {
  const text = planetDisplayNameOf(planetIndex)
  return { iconId: STAR_MAP_ICON_ID, text, testId: TRAVEL_CARD_FACT_IDS.destination }
}

/** The star map's own gravity fact: the planet glyph and "1.25 g" (#724). */
function gravityFactOf(planetIndex: number): TravelCardFact {
  const { text, exact } = planetGravityTraitOf(planetIndex)
  return { iconId: PLANET_ICON_ID, text, exact, testId: TRAVEL_CARD_FACT_IDS.gravity }
}
