/**
 * The list of placed containers on the base sheet (the TD's final ruling on #823, point 8): one
 * card per container the session shows, this planet's first, in the sheet's one scroll area, so
 * the list grows with the containers at 360 px and 1280+ and never caps. A card names the kind,
 * says where it waits and whose it is, and shows its units; its one verb takes the cargo back into
 * the hold, greyed while the container is out of reach, elsewhere or not the player's to open.
 * The tab shows once any container does.
 */
import { submitCommand } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { SheetCard, type SheetCardText } from '../../../ui/kit/SheetCard'
import type { SheetTab } from '../../../ui/registries/sheetTabs'
import { useScreenModel } from '../../../ui/useScreenModel'
import { pickupContainerIntent } from '../systems/containerRules'
import { containerRowsOf, type ContainerRow } from '../systems/containerViews'
import { readContainerRows } from '../store/containerReads'
import { PLANET_KIT_TEST_IDS } from './testIds'
import styles from './ContainersTab.module.css'

export const CONTAINERS_TAB_ID = 'planet-kit.containers'

/** After the Hold (30), before the Ledger (40): the cargo it holds is the Hold's, set aside. */
const CONTAINERS_TAB_ORDER = 35

export const CONTAINERS_TAB: SheetTab = {
  id: CONTAINERS_TAB_ID,
  title: 'Cache Crates',
  order: CONTAINERS_TAB_ORDER,
  isShownOn: (state, playerId) => containerRowsOf(state, playerId).length > 0,
  Panel: ContainersPanel,
}

function ContainersPanel() {
  const rows = useScreenModel(readContainerRows)
  return (
    <div className={styles.cards}>
      {rows.map((row) => (
        <ContainerCard key={row.key} row={row} />
      ))}
    </div>
  )
}

function ContainerCard({ row }: { row: ContainerRow }) {
  return (
    <SheetCard
      text={cardTextOf(row)}
      onAct={() => takeContainer(row)}
      figure={`×${row.units}`}
      figureNote={row.isHere ? 'Here' : `Planet ${row.planetKey}`}
      isMuted={!row.canTake}
      testId={PLANET_KIT_TEST_IDS.containerCard}
    />
  )
}

/** A title of the kind's name and one line of where it waits and whose it is. */
function cardTextOf(row: ContainerRow): SheetCardText {
  const owner = row.isOwn ? 'Yours' : `Held by ${row.ownerId}`
  return {
    id: `${CONTAINERS_TAB_ID}.${row.key}`,
    title: row.name,
    line: `${owner}, at cell ${row.cell.tx}, ${row.cell.ty}.`,
  }
}

/** The authority refuses, at no cost, what cannot move: a greyed card's press changes nothing. */
function takeContainer(row: ContainerRow): void {
  submitCommand(useGameStore.getState().playerId, pickupContainerIntent(row.containerId))
}
