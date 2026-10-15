/**
 * The shared UI parts on one page (build #423, spec #422), for the Game Director's screenshot and
 * the kernel e2e: the Title+OneLine element as a card with a price, as a locked node and as a
 * plain row, each with its brass tooltip, a panel header with one, and the steampunk scroll area
 * over a long ledger. No player control opens it; `steampunkDebug.ui.openScreen('example.ui-parts')`
 * does. Nothing here is a command: the Buy button buys nothing.
 */
import { Button } from '../../../ui/kit/Button'
import { Panel } from '../../../ui/kit/Panel'
import { ScrollArea } from '../../../ui/kit/ScrollArea'
import { TitleOneLine, type IconValue } from '../../../ui/kit/TitleOneLine'
import type { ScreenProps } from '../../../ui/registries/screens'
import { hudLabelIconIdOf, panelIconIdOf, trackIconIdOf } from '../../../systems/art/icons/iconSet'
import type { ElementText, UiTextUnderTitle } from '../../../systems/views/uiText'
import styles from './UiPartsScreen.module.css'

export const UI_PARTS_SCREEN_ID = 'example.ui-parts'

const PAGE_HEADING: UiTextUnderTitle = {
  id: `${UI_PARTS_SCREEN_ID}.header`,
  oneLine: 'Every shared part once, as a panel pass will draw it.',
  tooltipLines: ['A panel header carries a tooltip too.', 'Escape or Back closes the page.'],
}

/** A card: the buyable's name, its effect sentence, the price as an icon plus a value. */
const CARD: ElementText = {
  id: `${UI_PARTS_SCREEN_ID}.card`,
  title: 'Drill power',
  oneLine: 'Cuts harder rock and cuts every band a little faster.',
  tooltipLines: [
    'A heavier head on the same drive shaft.',
    'Each level also costs a little more energy.',
    'Next major at level 10.',
  ],
}

const CARD_PRICE: readonly IconValue[] = [
  { iconId: hudLabelIconIdOf('money'), text: '1.2k', exact: '1234', holds: 'price' },
]

/** A locked node: the price and why it is locked stay on the element; the tooltip adds the lore. */
const LOCKED_NODE: ElementText = {
  id: `${UI_PARTS_SCREEN_ID}.locked`,
  title: 'Long barrel',
  oneLine: 'The bore gun reaches two tiles further.',
  tooltipLines: ['A brass sleeve over the muzzle.', 'If it can hit it, you can see it.'],
}

const LOCKED_NODE_PRICE: readonly IconValue[] = [
  { iconId: hudLabelIconIdOf('money'), text: '48k', exact: '48000', holds: 'price' },
]

/** A plain row with no tooltip: the title and the one line are the whole of it. */
const ROW: ElementText = {
  id: `${UI_PARTS_SCREEN_ID}.row`,
  title: 'Casing grade 2',
  oneLine: 'Holds band 2 and band 3 walls open.',
  tooltipLines: [],
}

const LEDGER_LINES: readonly string[] = Array.from(
  { length: 30 },
  (_, index) => `Ledger line ${index + 1}: sold ore for the Works.`,
)

export function UiPartsScreen({ onDismiss }: ScreenProps) {
  return (
    <div className={styles.page} data-testid="ui-parts-demo">
      <Panel title="Shared UI parts" iconId={panelIconIdOf('upgrades')} heading={PAGE_HEADING}>
        <div className={styles.columns}>
          <section className={styles.elements}>
            <TitleOneLine text={CARD} iconId={trackIconIdOf('drill_power')} facts={CARD_PRICE}>
              <Button label="Buy" onPress={buyNothing} />
            </TitleOneLine>
            <TitleOneLine
              text={LOCKED_NODE}
              iconId={trackIconIdOf('gun')}
              facts={LOCKED_NODE_PRICE}
              lockReason="Needs: Bore gun sight"
            />
            <TitleOneLine text={ROW} level="span" />
          </section>
          <ScrollArea className={styles.ledger} testId="ui-parts-scroll">
            <ol className={styles.lines}>
              {LEDGER_LINES.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          </ScrollArea>
        </div>
        <Button label="Back" onPress={onDismiss} />
      </Panel>
    </div>
  )
}

/** The demo's Buy is a look, not a purchase: it submits no command. */
function buyNothing(): void {}
