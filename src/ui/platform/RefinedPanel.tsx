/** The Sell bay's ready Refinery batches and Collect (#105): refined ore is paid here only. */
import {
  refinedLineId,
  type RefinedLine,
  type RefinedPanel as Refined,
} from '../../systems/views/refinedPanel'
import { Panel } from '../kit/Panel'
import { UI_IDS } from '../ids'
import { ScreenButtonView } from '../ScreenButtonView'
import styles from './Platform.module.css'

export function RefinedPanel({ refined, focusedId }: { refined: Refined; focusedId: string }) {
  return (
    <Panel title="Refined">
      <div data-testid={UI_IDS.sellbayRefined}>
        {refined.lines.map((line) => (
          <RefinedLineView key={line.slot} line={line} />
        ))}
      </div>
      <div className={styles.action}>
        <ScreenButtonView button={refined.collect} focusedId={focusedId} />
        <span data-testid={UI_IDS.sellbayRefinedTotal} data-exact={refined.total.exact}>
          {refined.total.text}
        </span>
      </div>
    </Panel>
  )
}

function RefinedLineView({ line }: { line: RefinedLine }) {
  return (
    <div className={styles.row} data-testid={refinedLineId(line)} data-tier={line.tier}>
      <span className={styles.tier}>T{line.tier}</span>
      <span>{line.units} x</span>
      <span data-exact={line.value.exact}>{line.value.text}</span>
    </div>
  )
}
