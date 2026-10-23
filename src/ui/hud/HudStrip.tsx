/**
 * The strip (spec #678, ticket 684; docs/ui/design-system.md sections 9 and 10): the one
 * always-on top box, right under the top inset. The brass gauge cluster (ticket 716: hull, fuel,
 * cargo chain, the heat above 60% and the depth and core), one number (the money on the brass
 * odometer on the surface with the next-upgrade chip beside it, the depth underground), the
 * money's float-up, and the status icons. Every exact value and word is in the detail behind the
 * gear button; on desktop a dial also shows its number on a hover or a tap, and a resting mouse
 * shows a dial's, the money's or the chip's full value in the long mode (ticket 768). Desktop keeps
 * the star map's fuel wells beside the dials, in the button that opens the star map (ticket 769),
 * and tints the depth while gravity limits the descent (ticket 767). Drawn from `hudStripOf`, `gaugeClusterOf` and `desktopStripSlotsOf`; markup only.
 */
import { hudLabelIconIdOf } from '../../systems/art/icons/iconSet'
import { longPriceOfExact, stripNumberLongTextOf } from '../../systems/views/hoverValues'
import { readoutTextOf } from '../../systems/views/hudCallouts'
import type { DesktopStripSlots } from '../../systems/views/desktopStripSlots'
import type { HudModel } from '../../systems/views/hudModel'
import type { GaugeClusterView } from '../../systems/views/gaugeCluster'
import type { HudStrip as Strip, StripNumber } from '../../systems/views/hudStrip'
import { chipWordsOf, type NextUpgradeChip } from '../../systems/views/nextUpgradeChip'
import type { AmountReading } from '../../systems/views/viewParts'
import { UI_IDS } from '../ids'
import { Odometer } from '../kit/Odometer'
import { HoverPlate } from '../kit/HoverPlate'
import { TitleOneLine } from '../kit/TitleOneLine'
import { useMouseHover } from '../kit/useMouseHover'
import { DialCluster } from './DialCluster'
import { hudBoxOf } from './hudBoxes'
import { MoneyFloatUp } from './MoneyFloatUp'
import { StarMapButton } from './StarMapButton'
import { StripStatuses } from './StripStatuses'
import { useDialReveal } from './useDialReveal'
import styles from './HudStrip.module.css'

const NUMBER_TEXTS = {
  money: readoutTextOf('hud.strip.money', 'Money'),
  depth: readoutTextOf('hud.strip.depth', 'Depth'),
}

const NUMBER_ICON_IDS = { money: hudLabelIconIdOf('money'), depth: hudLabelIconIdOf('depth') }

export function HudStrip({
  strip,
  cluster,
  model,
  isFlashing,
  statusIconsMax,
  onTurnDials,
  slots = null,
}: {
  strip: Strip
  cluster: GaugeClusterView
  model: HudModel
  isFlashing: boolean
  /** The status row's room; a phone's three when not given. */
  statusIconsMax?: number
  /** Turns the gauge cluster's page on desktop (ticket 767). */
  onTurnDials?: (page: number) => void
  /** Desktop's fuel wells and gravity tint (ticket 767); none on a phone. */
  slots?: DesktopStripSlots | null
}) {
  return (
    <div
      className={styles.strip}
      data-testid={UI_IDS.hudStrip}
      data-number={strip.number.kind}
      {...hudBoxOf('strip')}
    >
      <DialCluster cluster={cluster} isFlashing={isFlashing} onTurnPage={onTurnDials} />
      {slots !== null && <StarMapButton fuelCostChars={slots.fuelCostChars} />}
      <StripNumberReadout
        number={strip.number}
        money={model.money}
        isGravityLimited={slots?.isDescentGravityLimited === true}
      />
      {strip.nextUpgrade !== null && <UpgradeChip chip={strip.nextUpgrade} />}
      <StripStatuses model={model} isFlashing={isFlashing} chipsMax={statusIconsMax} />
    </div>
  )
}

/** The one number, and the money's float-up under it whichever number shows. */
function StripNumberReadout({
  number,
  money,
  isGravityLimited,
}: {
  number: StripNumber
  money: AmountReading
  isGravityLimited: boolean
}) {
  const hover = useMouseHover()
  return (
    <div className={styles.number} {...hover.handlers}>
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
          <DepthText number={number} isGravityLimited={isGravityLimited} />
        )}
        <MoneyFloatUp exact={money.exact} />
      </TitleOneLine>
      {hover.isHovered && (
        <HoverPlate
          id={`strip:${number.kind}`}
          lines={[stripNumberLongTextOf(number)]}
          side="below"
        />
      )}
    </div>
  )
}

function DepthText({
  number,
  isGravityLimited,
}: {
  number: StripNumber
  isGravityLimited: boolean
}) {
  return (
    <span
      className={styles.depth}
      data-testid={UI_IDS.hudStripDepth}
      data-exact={number.exact}
      data-gravity={isGravityLimited || undefined}
    >
      {number.text}
    </span>
  )
}

/**
 * GD ruling 21 Oct 18:33: an icon and a price, no label; the cheapest new capability first, else
 * the cheaper drill step (ticket 719). A desktop hover or tap reveals its name and "{N} trips
 * away" under it, as a dial reveals its number.
 */
function UpgradeChip({ chip }: { chip: NextUpgradeChip }) {
  const { isRevealed, isHovered, handlers } = useDialReveal()
  const words = chipWordsOf(chip)
  return (
    <div
      className={styles.chip}
      data-offer={chip.offerKey}
      data-offer-kind={chip.kind}
      {...handlers}
    >
      <TitleOneLine
        text={words.text}
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
      {isRevealed && (
        <span className={styles.chipHover} data-chip-hover>
          {words.hoverLine}
        </span>
      )}
      {isHovered && (
        <HoverPlate
          id="strip:next-upgrade"
          lines={[longPriceOfExact(chip.price.exact)]}
          side="below"
          align="end"
        />
      )}
    </div>
  )
}
