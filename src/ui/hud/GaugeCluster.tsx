/**
 * Top left (#33 section 5): energy, hull and cargo as gauges with exact numbers, the cargo value
 * and, while there is one, the lining bill the next sale settles (#115); on a heat planet the heat
 * gauge with its icon, hatched and marked THROTTLED above its throttle line (#113).
 */
import type { HeatReading } from '../../systems/views/heatReading'
import type { HudModel } from '../../systems/views/hudModel'
import { UI_IDS } from '../ids'
import { Gauge } from '../kit/Gauge'
import { VectorIcon } from '../VectorIcon'
import styles from './Hud.module.css'

export function GaugeCluster({ model }: { model: HudModel }) {
  const isEnergyWarned = model.warning.level !== 'ok'
  return (
    <div className={styles.cluster}>
      <Gauge
        label="Energy"
        reading={model.energy}
        gaugeId={UI_IDS.hudEnergyGauge}
        textId={UI_IDS.hudEnergyText}
        isHatched={isEnergyWarned}
      />
      <Gauge
        label="Hull"
        reading={model.hull}
        gaugeId={UI_IDS.hudHullGauge}
        textId={UI_IDS.hudHullText}
      />
      <Gauge
        label="Cargo"
        reading={model.cargo}
        gaugeId={UI_IDS.hudCargoGauge}
        textId={UI_IDS.hudCargoText}
        isHatched={model.cargo.isFull}
      >
        <CargoNotes model={model} />
      </Gauge>
      {model.heat !== null && <HeatGauge heat={model.heat} />}
    </div>
  )
}

function HeatGauge({ heat }: { heat: HeatReading }) {
  return (
    <Gauge
      label="Heat"
      reading={heat}
      gaugeId={UI_IDS.hudHeatGauge}
      textId={UI_IDS.hudHeatText}
      isHatched={heat.isThrottled}
    >
      <span className={styles.notes}>
        <VectorIcon iconId={heat.iconId} />
        {heat.isThrottled && (
          <strong data-testid={UI_IDS.hudHeatThrottled} data-state="throttled">
            {heat.throttledText}
          </strong>
        )}
      </span>
    </Gauge>
  )
}

function CargoNotes({ model }: { model: HudModel }) {
  const { cargo, cargoValue, liningBill } = model
  return (
    <span className={styles.notes}>
      <span data-testid={UI_IDS.hudCargoCore}>{cargo.coreText}</span>
      {cargo.isFull && (
        <strong data-testid={UI_IDS.hudCargoFull} data-state="full">
          FULL
        </strong>
      )}
      <span data-testid={UI_IDS.hudCargoValue} data-exact={cargoValue.exact}>
        {cargoValue.text}
      </span>
      {liningBill !== null && (
        <span className={styles.liningBill}>
          lining{' '}
          <span data-testid={UI_IDS.hudLiningBill} data-exact={liningBill.exact}>
            {liningBill.text}
          </span>
        </span>
      )}
    </span>
  )
}
