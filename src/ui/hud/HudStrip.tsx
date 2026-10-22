/**
 * The strip (spec #678, ticket 684; docs/ui/design-system.md sections 9 and 10): the one
 * always-on top box, right under the top inset. The brass gauge cluster (ticket 716: hull, fuel,
 * cargo chain, the heat above 60% and the depth and core), one number (the money on the brass
 * odometer on the surface with the next-upgrade chip beside it, the depth underground), the
 * money's float-up, and the status icons. Every exact value and word is in the detail behind the
 * gear button; on desktop a dial also shows its number on a hover or a tap. Drawn from
 * `hudStripOf` and `gaugeClusterOf`; markup only.
 */
import { hudLabelIconIdOf } from '../../systems/art/icons/iconSet'
import { readoutTextOf } from '../../systems/views/hudCallouts'
import type { HudModel } from '../../systems/views/hudModel'
import type { GaugeClusterView } from '../../systems/views/gaugeCluster'
import type { HudStrip as Strip, StripNumber } from '../../systems/views/hudStrip'
import type { NextUpgradeChip } from '../../systems/views/nextUpgradeChip'
import type { AmountReading } from '../../systems/views/viewParts'
import { UI_IDS } from '../ids'
import { Odometer } from '../kit/Odometer'
import { TitleOneLine } from '../kit/TitleOneLine'
import { DialCluster } from './DialCluster'
import { hudBoxOf } from './hudBoxes'
import { MoneyFloatUp } from './MoneyFloatUp'
import { StripStatuses } from './StripStatuses'
import styles from './HudStrip.module.css'

const NUMBER_TEXTS = {
  money: readoutTextOf('hud.strip.money', 'Money'),
  depth: readoutTextOf('hud.strip.depth', 'Depth'),
}

const NUMBER_ICON_IDS = { money: hudLabelIconIdOf('money'), depth: hudLabelIconIdOf('depth') }

const CHIP_TEXT = readoutTextOf('hud.strip.next-upgrade', 'Next upgrade')

export function HudStrip({
  strip,
  cluster,
  model,
  isFlashing,
  statusIconsMax,
}: {
  strip: Strip
  cluster: GaugeClusterView
  model: HudModel
  isFlashing: boolean
  /** The status row's room; a phone's three when not given. */
  statusIconsMax?: number
}) {
  return (
    <div
      className={styles.strip}
      data-testid={UI_IDS.hudStrip}
      data-number={strip.number.kind}
      {...hudBoxOf('strip')}
    >
      <DialCluster cluster={cluster} isFlashing={isFlashing} />
      <StripNumberReadout number={strip.number} money={model.money} />
      {strip.nextUpgrade !== null && <UpgradeChip chip={strip.nextUpgrade} />}
      <StripStatuses model={model} isFlashing={isFlashing} chipsMax={statusIconsMax} />
    </div>
  )
}

/** The one number, and the money's float-up under it whichever number shows. */
function StripNumberReadout({ number, money }: { number: StripNumber; money: AmountReading }) {
  return (
    <div className={styles.number}>
      <TitleOneLine
        text={NUMBER_TEXTS[number.kind]}
        iconId={NUMBER_ICON_IDS[number.kind]}
        level="span"
        layout="row"
        glyphSize="menu"
        titlePlace="card"
      >
        {number.kind === 'money' ? (
          <Odometer text={number.text} exact={number.exact} testId={UI_IDS.hudStripMoney} />
        ) : (
          <DepthText number={number} />
        )}
        <MoneyFloatUp exact={money.exact} />
      </TitleOneLine>
    </div>
  )
}

function DepthText({ number }: { number: StripNumber }) {
  return (
    <span className={styles.depth} data-testid={UI_IDS.hudStripDepth} data-exact={number.exact}>
      {number.text}
    </span>
  )
}

/** GD ruling 21 Oct 18:33: the cheapest drill or tip, its icon and price, no label. */
function UpgradeChip({ chip }: { chip: NextUpgradeChip }) {
  return (
    <div className={styles.chip} data-upgrade={chip.upgradeId}>
      <TitleOneLine
        text={CHIP_TEXT}
        facts={[
          {
            iconId: chip.iconId,
            text: chip.price.text,
            holds: 'price',
            testId: UI_IDS.hudNextUpgrade,
          },
        ]}
        level="span"
        layout="row"
        glyphSize="menu"
        titlePlace="card"
      />
    </div>
  )
}
