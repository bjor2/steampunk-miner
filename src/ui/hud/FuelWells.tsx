/**
 * Desktop's wells on the strip for the star map's fuel (ticket 767; #650): the fuel tank's dial and
 * the next hop's fuel cost, empty and out of sight until the fuel state (#755) fills them, each
 * keeping its width (the cost's at the shared formatter's widest figure) so filling them moves
 * nothing on the strip. Markup only.
 */
import type { CSSProperties } from 'react'
import { UI_IDS } from '../ids'
import styles from './HudStrip.module.css'

export function FuelWells({ fuelCostChars }: { fuelCostChars: number }) {
  return (
    <span className={styles.fuelWells} aria-hidden>
      <span className={styles.tankWell} data-testid={UI_IDS.hudFuelTankWell} />
      <span
        className={styles.costWell}
        style={{ '--fuel-cost-chars': fuelCostChars } as CSSProperties}
        data-testid={UI_IDS.hudFuelCostWell}
      />
    </span>
  )
}
