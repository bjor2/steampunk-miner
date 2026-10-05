/** The bay's name, money, planet, the core bay against the need, and the platform's state (#33, #37). */
import type { ReactNode } from 'react'
import type { BayHeader as Header } from '../../systems/views/bayFrame'
import { UI_IDS } from '../ids'
import { Gauge } from '../kit/Gauge'
import styles from './Platform.module.css'

export function BayHeader({ header }: { header: Header }) {
  return (
    <header className={styles.header}>
      <strong className={styles.bayName}>{header.bayName}</strong>
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
