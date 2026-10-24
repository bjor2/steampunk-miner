/**
 * The star map's chart (ticket 757; the GD lock on #650, Map UX), drawn since ticket 796 as a
 * carousel (Bjor, 24 Oct: the planets visualised, swiped or stepped through, moving on the solar
 * map between them): the shown planet as the hero with its card (name, the tank's line, the jump's
 * fuel and price, its gravity, and ticket 793's Buy fuel and Jump), then the system strip panned
 * toward it, the fuel tank with its next level at the Sell bay, the jump drive's offer and, on the
 * system's last planet, the way on. A planet the player cannot afford is dimmed, never locked or
 * hidden. Opening the map shows the planet the session is on.
 *
 * Both layouts are first-class: a narrow panel (a phone upright, the desktop dock) stacks the hero
 * over the strip; a wide one (a phone on its side) sets the strip and the tank left of the hero
 * and its controls. Drawn from `starMapViewOf`, `starMapCarouselOf` and `starMapControlsOf`;
 * markup only.
 */
import { useMemo, type CSSProperties } from 'react'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { getShell } from '../../shell/shell'
import { useGameStore } from '../../store/gameStore'
import { readStarMapCarousel, readStarMapControls, readStarMapModel } from '../../store/screenReads'
import { buttonIconIdOf } from '../../systems/art/icons/iconSet'
import {
  previewImagesAt,
  starMapCarouselImagesOf,
  type StarMapCarouselImages,
} from '../../systems/art/starMapCarouselImages'
import { UI_ASSETS_URL } from '../../systems/art/uiArt'
import type { StarMapCarousel } from '../../systems/views/starMapCarousel'
import type { JumpControls, StarMapControls } from '../../systems/views/starMapControls'
import type { StarMapTank, StarMapView } from '../../systems/views/starMapView'
import type { ElementText } from '../../systems/views/uiText'
import { TitleOneLine, type IconValue } from '../kit/TitleOneLine'
import { useScreenModel } from '../useScreenModel'
import { JumpDriveOffer, JumpOutOffer, PurchaseAction, purchaseFactOf } from './StarMapActions'
import { StarMapHero, StarMapPlanetCard } from './StarMapHero'
import { STAR_MAP_UI_IDS } from './starMapIds'
import { StarMapSystemStrip } from './StarMapSystemStrip'
import { useCarouselSwipe } from './useCarouselSwipe'
import styles from './StarMapChart.module.css'

const FUEL_ICON_ID = buttonIconIdOf('travel')
const PERMILLE = 1000

export function StarMapChart() {
  const map = useScreenModel(readStarMapModel)
  const carousel = useScreenModel(readStarMapCarousel)
  const controls = useScreenModel(readStarMapControls)
  const focusedId = useGameStore((state) => state.focusedControlId)
  const isMotionReduced = useGameStore((state) => !state.prefs.shake)
  const images = useMemo(shippedCarouselImages, [])
  return (
    <StarMapChartView
      map={map}
      carousel={carousel}
      controls={controls}
      focusedId={focusedId}
      isMotionReduced={isMotionReduced}
      images={images}
    />
  )
}

export function StarMapChartView({
  map,
  carousel,
  controls,
  focusedId,
  isMotionReduced,
  images,
}: {
  map: StarMapView
  carousel: StarMapCarousel
  controls: StarMapControls
  focusedId: string | null
  isMotionReduced: boolean
  images: StarMapCarouselImages
}) {
  const swipe = useCarouselSwipe()
  const picture = previewImagesAt(images, carousel.planet.previewAssetId).hero
  return (
    <div className={styles.chart} data-testid={STAR_MAP_UI_IDS.starMapChart}>
      <div className={styles.layout}>
        <section className={styles.showcase}>
          <StarMapHero
            carousel={carousel}
            picture={picture}
            isMotionReduced={isMotionReduced}
            swipe={swipe}
          />
          <StarMapPlanetCard
            planet={carousel.planet}
            jump={jumpAt(controls, carousel.planet.place)}
            focusedId={focusedId}
          />
        </section>
        <section className={styles.system}>
          <StarMapSystemStrip
            strip={carousel.strip}
            images={images}
            isMotionReduced={isMotionReduced}
            swipe={swipe}
          />
          <FuelTank tank={map.tank} controls={controls} focusedId={focusedId} />
          {controls.buyDrive !== null && (
            <JumpDriveOffer purchase={controls.buyDrive} focusedId={focusedId} />
          )}
          {controls.jumpOut !== null && (
            <JumpOutOffer controls={controls.jumpOut} focusedId={focusedId} />
          )}
        </section>
      </div>
    </div>
  )
}

/** The shipped sprites under the page's URL, as `UiArtTokens` names them (ticket 770). */
function shippedCarouselImages(): StarMapCarouselImages {
  return starMapCarouselImagesOf(SHIPPED_ART, getShell().resolvePageUrl(UI_ASSETS_URL))
}

/** The tank's level and bar, with its next level's price and button at the Sell bay. */
function FuelTank({
  tank,
  controls: { buyTank },
  focusedId,
}: {
  tank: StarMapTank
  controls: StarMapControls
  focusedId: string | null
}) {
  const facts =
    buyTank === null ? tankFactsOf(tank) : [...tankFactsOf(tank), purchaseFactOf(buyTank)]
  return (
    <div className={styles.tank} data-testid={STAR_MAP_UI_IDS.starMapTank}>
      <TitleOneLine text={TANK_TEXT} iconId={FUEL_ICON_ID} facts={facts}>
        {buyTank !== null && <PurchaseAction purchase={buyTank} focusedId={focusedId} />}
      </TitleOneLine>
      <TankBar fillPermille={tank.fillPermille} />
    </div>
  )
}

/** The shown planet's Jump and Buy fuel; null on the planet the session is on. */
function jumpAt(controls: StarMapControls, place: number): JumpControls | null {
  return controls.planets.find((planet) => planet.place === place) ?? null
}

/** The tank's fill as a brass-bezelled bar (`art.gaugeBar`); the numbers beside it are the value. */
function TankBar({ fillPermille }: { fillPermille: number }) {
  return (
    <span
      className={styles.tankBar}
      data-testid={STAR_MAP_UI_IDS.starMapTankBar}
      role="meter"
      aria-label={TANK_TEXT.title}
      aria-valuemin={0}
      aria-valuemax={PERMILLE}
      aria-valuenow={fillPermille}
      style={fillStyleOf(fillPermille)}
    >
      <span className={styles.tankFill} />
    </span>
  )
}

const TANK_TEXT: ElementText = {
  id: 'star-map.tank',
  title: 'Fuel tank',
  oneLine: '',
  tooltipLines: [],
}

function tankFactsOf({ held, capacity }: StarMapTank): IconValue[] {
  return [{ iconId: FUEL_ICON_ID, text: `${held.text} / ${capacity.text}`, exact: held.exact }]
}

function fillStyleOf(fillPermille: number): CSSProperties {
  return { '--fill': fillPermille / PERMILLE } as CSSProperties
}
