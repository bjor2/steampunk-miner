/**
 * The strip's detail (spec #678, ticket 684): what the stacked panels used to show all the time,
 * now one plate the gear button opens and closes. The dials with every exact number, the
 * readouts (band, casing, guns, charges, dock, core, tile time) and the status words, in one
 * scroll area. A mode, not HUD: it carries no `data-hud` box, and it does not hold play. The
 * shared sheet (#686) is where it moves once that lands.
 */
import type { HudModel } from '../../systems/views/hudModel'
import { UI_IDS } from '../ids'
import { ScrollArea } from '../kit/ScrollArea'
import { TitleOneLine } from '../kit/TitleOneLine'
import { DetailGauges } from './DetailGauges'
import { DetailReadouts } from './DetailReadouts'
import { DetailStatus } from './DetailStatus'
import { GEAR_TEXT } from './HudGearButton'
import styles from './HudDetail.module.css'

const DETAIL_TEXT = { ...GEAR_TEXT, id: 'hud.detail' }

export function HudDetail({
  model,
  isFlashing,
  isLeftHanded,
}: {
  model: HudModel
  isFlashing: boolean
  isLeftHanded: boolean
}) {
  return (
    <section
      id={UI_IDS.hudDetail}
      className={styles.detail}
      data-testid={UI_IDS.hudDetail}
      data-hand={isLeftHanded ? 'left' : 'right'}
    >
      <TitleOneLine text={DETAIL_TEXT} level="h2" />
      <ScrollArea className={styles.scroll}>
        <DetailGauges model={model} />
        <DetailReadouts model={model} />
        <DetailStatus model={model} isFlashing={isFlashing} />
      </ScrollArea>
    </section>
  )
}
