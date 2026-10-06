/**
 * The bay's emblem and name, money, planet, the core bay against the need, and the platform's
 * state (#33, #37), each field with its glyph of the icon set (#158).
 */
import type { ReactNode } from 'react'
import type { BayHeader as Header } from '../../systems/views/bayFrame'
import { UI_IDS } from '../ids'
import { Gauge } from '../kit/Gauge'
import { VectorIcon } from '../VectorIcon'
import styles from './Platform.module.css'

export function BayHeader({ header }: { header: Header }) {
  return (
    <header className={styles.header}>
      <strong className={styles.bayName}>
        <VectorIcon iconId={header.emblemId} size="menu" />
        {header.bayName}
      </strong>
      <Field label="Money" iconId={header.moneyIconId}>
        <span data-testid={UI_IDS.platformMoney} data-exact={header.money.exact}>
          {header.money.text}
        </span>
      </Field>
      <Field label="Planet" iconId={header.planetIconId}>
        <span data-testid={UI_IDS.platformPlanet}>{header.planet}</span>
      </Field>
      <Gauge
        label="Core bay"
        reading={header.coreBay}
        gaugeId={UI_IDS.platformCoreBayGauge}
        textId={UI_IDS.platformCoreBay}
      />
      <Field label="Platform" iconId={header.platformStateIconId}>
        <span data-testid={UI_IDS.platformState} data-state={header.platformState}>
          {header.platformStateText}
        </span>
      </Field>
    </header>
  )
}

export function Field({
  label,
  iconId = null,
  children,
}: {
  label: string
  iconId?: string | null
  children: ReactNode
}) {
  return (
    <span className={styles.field}>
      <span className={styles.fieldLabel}>
        {iconId !== null && <VectorIcon iconId={iconId} size="menu" />}
        {label}
      </span>
      {children}
    </span>
  )
}
