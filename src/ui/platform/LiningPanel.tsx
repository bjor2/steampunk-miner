/** The visit's lining bill, what the Sell bay has paid of it and what leaving forgives (#128). */
import type { LiningPanel as Lining } from '../../systems/views/liningPanel'
import type { AmountReading } from '../../systems/views/viewParts'
import { Panel } from '../kit/Panel'
import { UI_IDS } from '../ids'
import { Field } from './BayHeader'

export function LiningPanel({ lining }: { lining: Lining }) {
  return (
    <Panel title="Lining bill">
      <div data-testid={UI_IDS.sellbayLining}>
        <Amount label="Billed" testId={UI_IDS.sellbayLiningBilled} reading={lining.billed} />
        <Amount label="Paid from sales" testId={UI_IDS.sellbayLiningPaid} reading={lining.paid} />
        <Amount
          label="Forgiven on leaving"
          testId={UI_IDS.sellbayLiningForgiven}
          reading={lining.forgiven}
        />
      </div>
    </Panel>
  )
}

function Amount({
  label,
  testId,
  reading,
}: {
  label: string
  testId: string
  reading: AmountReading
}) {
  return (
    <Field label={label}>
      <span data-testid={testId} data-exact={reading.exact}>
        {reading.text}
      </span>
    </Field>
  )
}
