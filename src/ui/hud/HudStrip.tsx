/**
 * The strip (spec #678, ticket 684; docs/ui/design-system.md sections 9 and 10): the one
 * always-on top box, right under the top inset, read-only. Hull, fuel and cargo as brass bars,
 * the heat as an ember line along its foot above 60%, one number (the money on the brass odometer
 * on the surface with the next-upgrade chip beside it, the depth underground), the money's
 * float-up, and the status icons. Every exact value and word is in the detail behind the gear
 * button. Drawn from `hudStripOf`'s reading of the HUD model; markup only.
 */
import type { CSSProperties } from 'react'
import { hudLabelIconIdOf } from '../../systems/art/icons/iconSet'
import { readoutTextOf } from '../../systems/views/hudCallouts'
import type { HudModel } from '../../systems/views/hudModel'
import type { HudStrip as Strip, StripBar, StripNumber } from '../../systems/views/hudStrip'
import type { NextUpgradeChip } from '../../systems/views/nextUpgradeChip'
import type { AmountReading } from '../../systems/views/viewParts'
import { UI_ID_TEMPLATES, UI_IDS } from '../ids'
import { GaugeBar } from '../kit/GaugeBar'
import { Odometer } from '../kit/Odometer'
import { TitleOneLine } from '../kit/TitleOneLine'
import { hudBoxOf } from './hudBoxes'
import { MoneyFloatUp } from './MoneyFloatUp'
import { StripStatuses } from './StripStatuses'
import styles from './HudStrip.module.css'

const BAR_TEXTS = {
  hull: readoutTextOf('hud.strip.hull', 'Hull'),
  fuel: readoutTextOf('hud.strip.fuel', 'Fuel'),
  cargo: readoutTextOf('hud.strip.cargo', 'Cargo'),
  heat: readoutTextOf('hud.strip.heat', 'Heat'),
}

const NUMBER_TEXTS = {
  money: readoutTextOf('hud.strip.money', 'Money'),
  depth: readoutTextOf('hud.strip.depth', 'Depth'),
}

const NUMBER_ICON_IDS = { money: hudLabelIconIdOf('money'), depth: hudLabelIconIdOf('depth') }

const CHIP_TEXT = readoutTextOf('hud.strip.next-upgrade', 'Next upgrade')

export function HudStrip({
  strip,
  model,
  isFlashing,
}: {
  strip: Strip
  model: HudModel
  isFlashing: boolean
}) {
  return (
    <div
      className={styles.strip}
      data-testid={UI_IDS.hudStrip}
      data-number={strip.number.kind}
      {...hudBoxOf('strip')}
    >
      <div className={styles.bars}>
        {strip.bars.map((bar) => (
          <StripGauge key={bar.id} bar={bar} />
        ))}
      </div>
      <StripNumberReadout number={strip.number} money={model.money} />
      {strip.nextUpgrade !== null && <UpgradeChip chip={strip.nextUpgrade} />}
      <StripStatuses model={model} isFlashing={isFlashing} />
      {strip.heat !== null && <HeatLine heat={strip.heat} />}
    </div>
  )
}

function StripGauge({ bar }: { bar: StripBar }) {
  return (
    <GaugeBar
      text={BAR_TEXTS[bar.id]}
      iconId={bar.iconId}
      fill={bar.id}
      fillPermille={bar.fillPermille}
      tier={bar.tier}
      testId={UI_ID_TEMPLATES.hudBar(bar.id)}
    />
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

/**
 * Design section 9: heat is a 4 px ember line along the strip's foot, so it adds no box; hatched
 * under a ladder tier like a bar.
 */
function HeatLine({ heat }: { heat: StripBar }) {
  return (
    <div className={styles.heat} data-tier={heat.tier}>
      <TitleOneLine text={BAR_TEXTS.heat} level="span" titlePlace="card">
        <span
          className={styles.heatFill}
          data-testid={UI_IDS.hudHeatLine}
          data-permille={heat.fillPermille}
          data-tier={heat.tier}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={PERMILLE}
          aria-valuenow={heat.fillPermille}
          style={fillStyleOf(heat.fillPermille)}
        />
      </TitleOneLine>
    </div>
  )
}

const PERMILLE = 1000

function fillStyleOf(permille: number): CSSProperties {
  return { '--fill': permille / PERMILLE } as CSSProperties
}
