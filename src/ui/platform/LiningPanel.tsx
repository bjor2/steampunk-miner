/**
 * The visit's lining bill, what the Sell bay has paid of it and what leaving forgives (#128), each
 * a titled amount on the shared Title+OneLine element (spec #422, pass #427).
 */
import type { LiningPanel as Lining } from '../../systems/views/liningPanel'
import { panelIconIdOf } from '../../systems/art/icons/iconSet'
import { Panel } from '../kit/Panel'
import { TitleOneLine } from '../kit/TitleOneLine'
import { UI_IDS } from '../ids'
import styles from './Platform.module.css'
import { LINING_HEADING, liningAmountsOf } from './sellBayElements'

export function LiningPanel({ lining }: { lining: Lining }) {
  return (
    <Panel title="Lining bill" iconId={panelIconIdOf('lining')} heading={LINING_HEADING}>
      <div data-testid={UI_IDS.sellbayLining}>
        {liningAmountsOf(lining).map(({ text, fact }) => (
          <div key={text.id} className={styles.row}>
            <TitleOneLine text={text} facts={[fact]} level="span" />
          </div>
        ))}
      </div>
    </Panel>
  )
}
