/** Corner readout of what the store holds. Reads narrowly; per-frame data never comes here. */
import { useGameStore } from '../store/gameStore'
import { formatMoney } from '../systems/formatMoney'
import styles from './Hud.module.css'
import { Panel } from './kit/Panel'
import { VehicleReadout } from './VehicleReadout'

export function Hud() {
  const planetTier = useGameStore((state) => state.planetTier)
  const planetSeed = useGameStore((state) => state.planetSeed)
  const money = useGameStore((state) => state.money)
  const moneyText = formatMoney(money)

  return (
    <div className={styles.hud}>
      <Panel title="Planet">
        <div className={styles.row}>
          <span>Tier</span>
          <span>{planetTier}</span>
        </div>
        <div className={styles.row}>
          <span>Seed</span>
          <span>{planetSeed}</span>
        </div>
        <div className={styles.row}>
          <span>Money</span>
          <span>{moneyText}</span>
        </div>
      </Panel>
      <VehicleReadout />
    </div>
  )
}
