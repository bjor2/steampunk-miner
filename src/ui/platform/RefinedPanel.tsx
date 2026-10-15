/**
 * The Sell bay's ready Refinery batches and Collect (#105): refined ore is paid here only. Each
 * batch, and the total with Collect, is one shared Title+OneLine element (spec #422, pass #427).
 */
import {
  refinedLineId,
  type RefinedLine,
  type RefinedPanel as Refined,
} from '../../systems/views/refinedPanel'
import { panelIconIdOf } from '../../systems/art/icons/iconSet'
import { Panel } from '../kit/Panel'
import { TitleOneLine } from '../kit/TitleOneLine'
import { UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import styles from './Platform.module.css'
import {
  REFINED_COLLECT_TEXT,
  REFINED_HEADING,
  refinedLineFactsOf,
  refinedLineTextOf,
  refinedTotalFactsOf,
} from './sellBayElements'

export function RefinedPanel({ refined, focusedId }: { refined: Refined; focusedId: string }) {
  return (
    <Panel title="Refined" iconId={panelIconIdOf('refined')} heading={REFINED_HEADING}>
      <div data-testid={UI_IDS.sellbayRefined}>
        {refined.lines.map((line) => (
          <RefinedLineView key={line.slot} line={line} />
        ))}
      </div>
      <div className={styles.row}>
        <TitleOneLine text={REFINED_COLLECT_TEXT} facts={refinedTotalFactsOf(refined)} level="span">
          <ScreenButtonView button={refined.collect} focusedId={focusedId} />
        </TitleOneLine>
      </div>
    </Panel>
  )
}

function RefinedLineView({ line }: { line: RefinedLine }) {
  return (
    <div className={styles.row} data-testid={refinedLineId(line)} data-tier={line.tier}>
      <TitleOneLine
        text={refinedLineTextOf(line)}
        iconId={line.iconId}
        facts={refinedLineFactsOf(line)}
        level="span"
      />
    </div>
  )
}
