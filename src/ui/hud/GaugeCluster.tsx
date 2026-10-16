/**
 * Top left (#33 section 5): energy, hull and cargo as gauges with exact numbers, the cargo value
 * and, while there is one, the lining bill the next sale settles (#115); on a heat planet the heat
 * gauge with its icon, hatched and marked THROTTLED above its throttle line (#113). Each gauge is a
 * dial beside one shared Title+OneLine element (spec #422, pass #428): its name as the title, every
 * number a glyph and its value.
 */
import type { ReactNode } from 'react'
import { hudLabelIconIdOf } from '../../systems/art/icons/iconSet'
import { readoutTextOf } from '../../systems/views/hudCallouts'
import type { HeatReading } from '../../systems/views/heatReading'
import type { GaugeReading, HudModel } from '../../systems/views/hudModel'
import type { AmountReading } from '../../systems/views/viewParts'
import { UI_IDS } from '../ids'
import { GaugeDial } from '../kit/Gauge'
import { TitleOneLine, type IconValue } from '../kit/TitleOneLine'
import { hudBoxOf } from './hudBoxes'
import styles from './Hud.module.css'

export function GaugeCluster({ model }: { model: HudModel }) {
  const isEnergyWarned = model.warning.level !== 'ok'
  return (
    <div className={styles.cluster} {...hudBoxOf('gauges')}>
      <HudGauge
        textId="hud.energy"
        label="Energy"
        reading={model.energy}
        gaugeId={UI_IDS.hudEnergyGauge}
        facts={[gaugeFactOf(model.energy, UI_IDS.hudEnergyText)]}
        isHatched={isEnergyWarned}
      />
      <HudGauge
        textId="hud.hull"
        label="Hull"
        reading={model.hull}
        gaugeId={UI_IDS.hudHullGauge}
        facts={[gaugeFactOf(model.hull, UI_IDS.hudHullText)]}
      />
      <HudGauge
        textId="hud.cargo"
        label="Cargo"
        reading={model.cargo}
        gaugeId={UI_IDS.hudCargoGauge}
        facts={cargoFactsOf(model)}
        isHatched={model.cargo.isFull}
      >
        {model.cargo.isFull && (
          <strong data-testid={UI_IDS.hudCargoFull} data-state="full">
            FULL
          </strong>
        )}
      </HudGauge>
      {model.heat !== null && <HeatGauge heat={model.heat} />}
    </div>
  )
}

function HeatGauge({ heat }: { heat: HeatReading }) {
  return (
    <HudGauge
      textId="hud.heat"
      label="Heat"
      reading={heat}
      gaugeId={UI_IDS.hudHeatGauge}
      facts={[gaugeFactOf(heat, UI_IDS.hudHeatText)]}
      isHatched={heat.isThrottled}
    >
      {heat.isThrottled && (
        <strong data-testid={UI_IDS.hudHeatThrottled} data-state="throttled">
          {heat.throttledText}
        </strong>
      )}
    </HudGauge>
  )
}

/** A dial, then its element: the gauge's name, its values, and a state word when one stands. */
function HudGauge({
  textId,
  label,
  reading,
  gaugeId,
  facts,
  isHatched = false,
  children,
}: {
  textId: string
  label: string
  reading: GaugeReading
  gaugeId: string
  facts: readonly IconValue[]
  isHatched?: boolean
  children?: ReactNode
}) {
  return (
    <div className={styles.gauge}>
      <GaugeDial reading={reading} gaugeId={gaugeId} isHatched={isHatched} />
      <TitleOneLine text={readoutTextOf(textId, label)} facts={facts} level="span" glyphSize="hud">
        {children}
      </TitleOneLine>
    </div>
  )
}

function gaugeFactOf(reading: GaugeReading, testId: string): IconValue {
  return { iconId: reading.iconId, text: reading.text, exact: reading.exact, testId }
}

/** The hold, its core fragments while it carries any, its sale value and any lining bill. */
function cargoFactsOf(model: HudModel): IconValue[] {
  const { cargo, cargoValue, liningBill } = model
  return [
    gaugeFactOf(cargo, UI_IDS.hudCargoText),
    ...coreFactsOf(cargo.coreText),
    amountFactOf('cargo_value', cargoValue, UI_IDS.hudCargoValue),
    ...(liningBill === null ? [] : [liningBillFactOf(liningBill)]),
  ]
}

function coreFactsOf(coreText: string): IconValue[] {
  if (coreText === '') return []
  return [{ iconId: hudLabelIconIdOf('core'), text: coreText, testId: UI_IDS.hudCargoCore }]
}

function amountFactOf(
  icon: 'cargo_value' | 'lining_bill',
  reading: AmountReading,
  testId: string,
): IconValue {
  return { iconId: hudLabelIconIdOf(icon), text: reading.text, exact: reading.exact, testId }
}

/** #115: a cost the next sale settles, so it holds `price` and stays on the element. */
function liningBillFactOf(liningBill: AmountReading): IconValue {
  return { ...amountFactOf('lining_bill', liningBill, UI_IDS.hudLiningBill), holds: 'price' }
}
