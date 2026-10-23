/**
 * The star map's chart (ticket 757; the GD lock on #650, Map UX): the fuel tank, then the system
 * view (ticket 758, the map art pass): the sun at the head of a brass rail and one row per planet
 * of the session's system strung along it, each a planet glyph in the planet's own ground colour
 * (the `art.starMap` sprites, the planet's disc tinted through its mask) with the fuel its jump
 * burns, what that fuel costs and a line of the tank against it with any shortfall. The planet the
 * session is on wears the here ring; a planet the player cannot afford is dimmed, never locked or
 * hidden. Read-only (HS): nothing on it acts. The same chart fills the phone's full panel and
 * desktop's docked one. Drawn from `starMapViewOf`; markup only.
 */
import type { CSSProperties } from 'react'
import { readStarMapModel } from '../../store/screenReads'
import { buttonIconIdOf, hudLabelIconIdOf } from '../../systems/art/icons/iconSet'
import type { ElementText } from '../../systems/views/uiText'
import type { StarMapPlanet, StarMapTank, StarMapView } from '../../systems/views/starMapView'
import { TitleOneLine, type IconValue } from '../kit/TitleOneLine'
import { useScreenModel } from '../useScreenModel'
import { starMapGlyphIdOf, starMapPlanetIdOf, STAR_MAP_UI_IDS } from './starMapIds'
import styles from './StarMapChart.module.css'

const FUEL_ICON_ID = buttonIconIdOf('travel')
const MONEY_ICON_ID = hudLabelIconIdOf('money')
const PERMILLE = 1000

export function StarMapChart() {
  const map = useScreenModel(readStarMapModel)
  return <StarMapChartView map={map} />
}

export function StarMapChartView({ map }: { map: StarMapView }) {
  return (
    <div className={styles.chart} data-testid={STAR_MAP_UI_IDS.starMapChart}>
      <div className={styles.tank} data-testid={STAR_MAP_UI_IDS.starMapTank}>
        <TitleOneLine text={TANK_TEXT} iconId={FUEL_ICON_ID} facts={tankFactsOf(map.tank)} />
        <TankBar fillPermille={map.tank.fillPermille} />
      </div>
      <ol className={styles.system}>
        <li className={styles.sun} data-testid={STAR_MAP_UI_IDS.starMapSun} aria-hidden />
        {map.planets.map((planet) => (
          <PlanetOnMap key={planet.place} planet={planet} />
        ))}
      </ol>
    </div>
  )
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

function PlanetOnMap({ planet }: { planet: StarMapPlanet }) {
  return (
    <li
      className={styles.planet}
      data-testid={starMapPlanetIdOf(planet.place)}
      data-here={planet.isHere || undefined}
      data-dimmed={planet.isDimmed || undefined}
    >
      <PlanetGlyph planet={planet} />
      <TitleOneLine text={planetTextOf(planet)} facts={planetFactsOf(planet)} />
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
