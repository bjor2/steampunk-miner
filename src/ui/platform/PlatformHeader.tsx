/** Money, planet, the core bay against the need, and the platform's state (#33 section 6). */
import type { ReactNode } from 'react'
import type { PlatformHeader as Header } from '../../systems/views/platformModel'
import { UI_IDS } from '../ids'
import { Gauge } from '../kit/Gauge'
import styles from './Platform.module.css'

export function PlatformHeader({ header }: { header: Header }) {
  return (
    <header className={styles.header}>
      <Field label="Money">
        <span data-testid={UI_IDS.platformMoney} data-exact={header.money.exact}>
          {header.money.text}
        </span>
      </Field>
      <Field label="Planet">
        <span data-testid={UI_IDS.platformPlanet}>{header.planet}</span>
      </Field>
      <Gauge
        label="Core bay"
        reading={header.coreBay}
        gaugeId={UI_IDS.platformCoreBayGauge}
        textId={UI_IDS.platformCoreBay}
      />
      <Field label="Platform">
        <span data-testid={UI_IDS.platformState} data-state={header.platformState}>
          {header.platformStateText}
        </span>
      </Field>
    </header>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
    </span>
  )
}
