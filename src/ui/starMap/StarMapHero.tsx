/**
 * The star map carousel's hero (ticket 796; Bjor, 24 Oct: "the planets visualized there, with
 * swipe / next-previous buttons to switch between them"): the shown planet's Blender preview
 * (ticket 795) between Previous and Next, then its card: the name, the tank's line, the fuel the
 * jump burns, its price and the planet's gravity as its trait, with its Buy fuel and Jump (ticket
 * 793). An unaffordable planet is drained and keeps every number, never hidden (#650). The
 * picture crossfades in on a step and cuts under reduced motion; a planet with no preview wears
 * its glyph tinted the ground colour (ticket 758). A drag across it swipes. Markup only.
 */
import type { CSSProperties, MouseEvent } from 'react'
import { useGameStore } from '../../store/gameStore'
import { buttonIconIdOf, hudLabelIconIdOf } from '../../systems/art/icons/iconSet'
import type { UiPartImage } from '../../systems/art/uiArt'
import type { StarMapCarousel } from '../../systems/views/starMapCarousel'
import type { JumpControls } from '../../systems/views/starMapControls'
import type { StarMapPlanet } from '../../systems/views/starMapView'
import type { ElementText } from '../../systems/views/uiText'
import { TitleOneLine, type IconValue } from '../kit/TitleOneLine'
import { JumpActions } from './StarMapActions'
import { starMapGlyphIdOf, starMapPlanetIdOf, STAR_MAP_UI_IDS } from './starMapIds'
import type { SwipeHandlers } from './useCarouselSwipe'
import styles from './StarMapHero.module.css'

const FUEL_ICON_ID = buttonIconIdOf('travel')
const MONEY_ICON_ID = hudLabelIconIdOf('money')
const PLANET_ICON_ID = hudLabelIconIdOf('planet')

export function StarMapHero({
  carousel,
  picture,
  isMotionReduced,
  swipe,
}: {
  carousel: StarMapCarousel
  /** The shown planet's preview; null while it has none. */
  picture: UiPartImage | null
  isMotionReduced: boolean
  swipe: SwipeHandlers
}) {
  const stepStarMapPlanet = useGameStore((state) => state.stepStarMapPlanet)
  return (
    <div
      className={styles.hero}
      data-testid={STAR_MAP_UI_IDS.starMapHero}
      data-place={carousel.planet.place}
      data-motion={isMotionReduced ? 'cut' : 'ease'}
      {...swipe}
    >
      <StepButton
        label="Previous planet"
        testId={STAR_MAP_UI_IDS.starMapPrevious}
        isAvailable={carousel.canStepBack}
        onPress={() => stepStarMapPlanet(-1)}
      />
      <PlanetPicture key={carousel.planet.place} planet={carousel.planet} picture={picture} />
      <StepButton
        label="Next planet"
        testId={STAR_MAP_UI_IDS.starMapNext}
        isAvailable={carousel.canStepOn}
        onPress={() => stepStarMapPlanet(1)}
      />
    </div>
  )
}

/**
 * A chevron button, 48 px both ways on every layout. Not the kit's Button: its label would be text
 * outside the Title+OneLine element (#424), so the name rides on `aria-label` and the glyph is CSS.
 */
function StepButton({
  label,
  testId,
  isAvailable,
  onPress,
}: {
  label: string
  testId: string
  isAvailable: boolean
  onPress: () => void
}) {
  return (
    <button
      type="button"
      className={styles.step}
      data-testid={testId}
      aria-label={label}
      disabled={!isAvailable}
      onMouseDown={keepFocusOnGame}
      onClick={onPress}
    />
  )
}

/** The preview at the hero's size, or the tinted glyph where the planet has none. */
function PlanetPicture({
  planet,
  picture,
}: {
  planet: StarMapPlanet
  picture: UiPartImage | null
}) {
  if (picture === null) return <PlanetGlyph planet={planet} />
  return (
    <img
      className={styles.picture}
      src={picture.src}
      srcSet={picture.srcSet}
      alt=""
      draggable={false}
      data-testid={starMapGlyphIdOf(planet.place)}
      data-dimmed={planet.isDimmed || undefined}
    />
  )
}

/** The map's planet sprite (ticket 758) with its disc in the planet's ground colour. */
function PlanetGlyph({ planet }: { planet: StarMapPlanet }) {
  return (
    <span
      className={styles.glyph}
      style={{ '--planet-colour': planet.colour } as CSSProperties}
      data-testid={starMapGlyphIdOf(planet.place)}
      data-dimmed={planet.isDimmed || undefined}
      aria-hidden
    >
      <span className={styles.disc} />
    </span>
  )
}

/** The shown planet's name and numbers, with its Buy fuel and Jump. */
export function StarMapPlanetCard({
  planet,
  jump,
  focusedId,
}: {
  planet: StarMapPlanet
  /** Null on the planet the session is on. */
  jump: JumpControls | null
  focusedId: string | null
}) {
  return (
    <div
      className={styles.card}
      data-testid={starMapPlanetIdOf(planet.place)}
      data-here={planet.isHere || undefined}
      data-dimmed={planet.isDimmed || undefined}
    >
      <TitleOneLine text={planetTextOf(planet)} facts={planetFactsOf(planet)}>
        {jump !== null && <JumpActions controls={jump} focusedId={focusedId} />}
      </TitleOneLine>
    </div>
  )
}

function keepFocusOnGame(event: MouseEvent): void {
  event.preventDefault()
}

function planetTextOf(planet: StarMapPlanet): ElementText {
  const id = `star-map.planet.${planet.place}`
  return { id, title: planet.name, oneLine: planet.line, tooltipLines: [] }
}

/** The jump's fuel and price (none on the planet the session is on), then the gravity trait. */
function planetFactsOf(planet: StarMapPlanet): IconValue[] {
  const gravity: IconValue = { iconId: PLANET_ICON_ID, ...planet.gravity }
  if (planet.fuel === null || planet.fee === null) return [gravity]
  return [
    { iconId: FUEL_ICON_ID, text: planet.fuel.text, exact: planet.fuel.exact, holds: 'needs' },
    { iconId: MONEY_ICON_ID, ...planet.fee, holds: 'price', isMoneyShort: planet.isDimmed },
    gravity,
  ]
}
