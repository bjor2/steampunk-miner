/**
 * The example's two tabs on the base sheet (ticket 686), for the kernel e2e and the screenshot
 * suite: a tab of cards long enough to scroll on a phone, and a second tab so the bar shows. No
 * player sees them; `steampunkDebug.features.example.showSheetTabs()` puts them on the bar and
 * `ui.openSheet('example.cards')` opens the sheet. A card's act only records which card acted.
 */
import { SheetCard, type SheetCardText } from '../../../ui/kit/SheetCard'
import type { SheetTab } from '../../../ui/registries/sheetTabs'
import { areSheetProbeTabsShown, recordActedCard } from '../store/sheetProbeStore'
import styles from './ExampleSheetTabs.module.css'

export const EXAMPLE_CARDS_TAB_ID = 'example.cards'
export const EXAMPLE_LEDGER_TAB_ID = 'example.ledger'

const CARDS: readonly SheetCardText[] = [
  ['drill', 'Drill power', 'Cuts harder rock and every band a little faster.'],
  ['hull', 'Hull plates', 'Takes harder knocks before the rig needs a tow.'],
  ['fuel', 'Fuel tank', 'Carries more coal for a longer dig.'],
  ['cargo', 'Cargo hold', 'Holds more ore before a trip to the Sell bay.'],
  ['engine', 'Engine', 'Climbs faster with a full hold.'],
  ['tip', 'Drill tip', 'Bites through the next band on this planet.'],
  ['casing', 'Casing', 'Holds shaft walls open in softer bands.'],
  ['lining', 'Lining', 'Keeps lava pockets behind the casing.'],
  ['lamp', 'Head lamp', 'Shows ore further down the shaft.'],
  ['radiator', 'Radiator', 'Sheds heat faster on hot planets.'],
].map(([id, title, line]) => ({ id: `${EXAMPLE_CARDS_TAB_ID}.${id}`, title, line }))

const LEDGER: readonly SheetCardText[] = [
  ['sold', 'Sold ore', 'Twelve ore sold at the Sell bay.'],
  ['bought', 'Bought drill', 'Drill power raised one level.'],
  ['travel', 'Travelled', 'Arrived on the next planet.'],
].map(([id, title, line]) => ({ id: `${EXAMPLE_LEDGER_TAB_ID}.${id}`, title, line }))

export const EXAMPLE_SHEET_TABS: readonly SheetTab[] = [
  {
    id: EXAMPLE_CARDS_TAB_ID,
    title: 'Sample Cards',
    order: 900,
    isShownOn: areSheetProbeTabsShown,
    Panel: () => <CardList cards={CARDS} />,
  },
  {
    id: EXAMPLE_LEDGER_TAB_ID,
    title: 'Sample Ledger',
    order: 901,
    isShownOn: areSheetProbeTabsShown,
    Panel: () => <CardList cards={LEDGER} />,
  },
]

function CardList({ cards }: { cards: readonly SheetCardText[] }) {
  return (
    <div className={styles.cards}>
      {cards.map((card) => (
        <SheetCard key={card.id} text={card} onAct={() => recordActedCard(card.id)} />
      ))}
    </div>
  )
}
