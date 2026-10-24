/**
 * The star map's chart (ticket 757; the GD lock on #650, Map UX): the fuel tank, then the system
 * view (ticket 758, the map art pass): the sun at the head of a brass rail and one row per planet
 * of the session's system strung along it, each a planet glyph in the planet's own ground colour
 * (the `art.starMap` sprites, the planet's disc tinted through its mask) with the fuel its jump
 * burns, what that fuel costs and a line of the tank against it with any shortfall. The planet the
 * session is on wears the here ring; a planet the player cannot afford is dimmed, never locked or
 * hidden. Since ticket 793 each other planet carries its Jump (two presses) and, at the Sell bay,
 * a Buy fuel for its shortfall; the tank its next level and the drive its offer there, and the
 * system's last planet the jump on to the next system once the drive is fitted (`StarMapActions`).
 * The same chart fills the phone's full panel and desktop's docked one. Drawn from `starMapViewOf`
 * and `starMapControlsOf`; markup only.
 */
import type { CSSProperties } from 'react'
import { useGameStore } from '../../store/gameStore'
import { readStarMapControls, readStarMapModel } from '../../store/screenReads'
import { buttonIconIdOf, hudLabelIconIdOf } from '../../systems/art/icons/iconSet'
import type { ElementText } from '../../systems/views/uiText'
import type { JumpControls, StarMapControls } from '../../systems/views/starMapControls'
import type { StarMapPlanet, StarMapTank, StarMapView } from '../../systems/views/starMapView'
import { TitleOneLine, type IconValue } from '../kit/TitleOneLine'
import { useScreenModel } from '../useScreenModel'
import {
  JumpActions,
  JumpDriveOffer,
  JumpOutOffer,
  PurchaseAction,
  purchaseFactOf,
} from './StarMapActions'
import { starMapGlyphIdOf, starMapPlanetIdOf, STAR_MAP_UI_IDS } from './starMapIds'
import styles from './StarMapChart.module.css'

const FUEL_ICON_ID = buttonIconIdOf('travel')
const MONEY_ICON_ID = hudLabelIconIdOf('money')
const PERMILLE = 1000

export function StarMapChart() {
  const map = useScreenModel(readStarMapModel)
  const controls = useScreenModel(readStarMapControls)
  const focusedId = useGameStore((state) => state.focusedControlId)
  return <StarMapChartView map={map} controls={controls} focusedId={focusedId} />
}

export function StarMapChartView({
  map,
  controls,
  focusedId,
}: {
  map: StarMapView
  controls: StarMapControls
  focusedId: string | null
}) {
  return (
    <div className={styles.chart} data-testid={STAR_MAP_UI_IDS.starMapChart}>
      <FuelTank tank={map.tank} controls={controls} focusedId={focusedId} />
      {controls.buyDrive !== null && (
        <JumpDriveOffer purchase={controls.buyDrive} focusedId={focusedId} />
      )}
      <ol className={styles.system}>
        <li className={styles.sun} data-testid={STAR_MAP_UI_IDS.starMapSun} aria-hidden />
        {map.planets.map((planet) => (
          <PlanetOnMap
            key={planet.place}
            planet={planet}
            jump={jumpAt(controls, planet.place)}
            focusedId={focusedId}
          />
        ))}
      </ol>
      {controls.jumpOut !== null && (
        <JumpOutOffer controls={controls.jumpOut} focusedId={focusedId} />
      )}
    </div>
  )
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

function PlanetOnMap({
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
    <li
      className={styles.planet}
      data-testid={starMapPlanetIdOf(planet.place)}
      data-here={planet.isHere || undefined}
      data-dimmed={planet.isDimmed || undefined}
    >
      <PlanetGlyph planet={planet} />
      <TitleOneLine text={planetTextOf(planet)} facts={planetFactsOf(planet)}>
        {jump !== null && <JumpActions controls={jump} focusedId={focusedId} />}
      </TitleOneLine>
    </li>
  )
}

/** The planet sprite in the planet's ground colour, ringed when the session is on it. */
function PlanetGlyph({ planet }: { planet: StarMapPlanet }) {
  return (
    <span
      className={styles.glyph}
      data-testid={starMapGlyphIdOf(planet.place)}
      style={colourStyleOf(planet.colour)}
      aria-hidden
    >
      <span className={styles.disc} />
      {planet.isHere && <span className={styles.here} />}
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

function colourStyleOf(colour: string): CSSProperties {
  return { '--planet-colour': colour } as CSSProperties
}

function planetTextOf(planet: StarMapPlanet): ElementText {
  const id = `star-map.planet.${planet.place}`
  return { id, title: planet.name, oneLine: planet.line, tooltipLines: [] }
}

/** The jump's fuel and its price; the planet the session is on has neither. */
function planetFactsOf({ fuel, fee, isDimmed }: StarMapPlanet): IconValue[] {
  if (fuel === null || fee === null) return []
  return [
    { iconId: FUEL_ICON_ID, text: fuel.text, exact: fuel.exact, holds: 'needs' },
    { iconId: MONEY_ICON_ID, ...fee, holds: 'price', isMoneyShort: isDimmed },
  ]
}
