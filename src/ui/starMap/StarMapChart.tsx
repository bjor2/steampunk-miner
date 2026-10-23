/**
 * The star map's chart (ticket 757; the GD lock on #650, Map UX): the fuel tank, then one row per
 * planet of the session's system, each with the fuel its jump burns, what that fuel costs and a line
 * of the tank against it with any shortfall. A planet the player cannot afford is dimmed, never
 * locked or hidden. Read-only (HS): nothing on it acts. The same chart fills the phone's full panel
 * and desktop's docked one. Drawn from `starMapViewOf`; markup only.
 */
import { readStarMapModel } from '../../store/screenReads'
import { buttonIconIdOf, hudLabelIconIdOf } from '../../systems/art/icons/iconSet'
import type { ElementText } from '../../systems/views/uiText'
import type { StarMapPlanet, StarMapTank, StarMapView } from '../../systems/views/starMapView'
import { TitleOneLine, type IconValue } from '../kit/TitleOneLine'
import { useScreenModel } from '../useScreenModel'
import { starMapPlanetIdOf, STAR_MAP_UI_IDS } from './starMapIds'
import styles from './StarMapChart.module.css'

const FUEL_ICON_ID = buttonIconIdOf('travel')
const MONEY_ICON_ID = hudLabelIconIdOf('money')
const PLANET_ICON_ID = hudLabelIconIdOf('planet')

export function StarMapChart() {
  const map = useScreenModel(readStarMapModel)
  return <StarMapChartView map={map} />
}

export function StarMapChartView({ map }: { map: StarMapView }) {
  return (
    <div className={styles.chart} data-testid={STAR_MAP_UI_IDS.starMapChart}>
      <div className={styles.tank} data-testid={STAR_MAP_UI_IDS.starMapTank}>
        <TitleOneLine text={TANK_TEXT} iconId={FUEL_ICON_ID} facts={tankFactsOf(map.tank)} />
      </div>
      <ol className={styles.planets}>
        {map.planets.map((planet) => (
          <PlanetOnMap key={planet.place} planet={planet} />
        ))}
      </ol>
    </div>
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
      <TitleOneLine
        text={planetTextOf(planet)}
        iconId={PLANET_ICON_ID}
        facts={planetFactsOf(planet)}
      />
    </li>
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
