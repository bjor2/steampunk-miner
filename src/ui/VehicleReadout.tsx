/**
 * A placeholder readout of the local vehicle (energy, hull, cargo, state) for the hand check of
 * the mining loop. The real HUD and its view model are Build 14's (#34).
 */
import { useGameStore } from '../store/gameStore'
import { cargoGaugeText, energyGaugeText, hullGaugeText } from '../systems/vehicle/vehicleReadout'
import { Panel } from './kit/Panel'
import styles from './VehicleReadout.module.css'

export function VehicleReadout() {
  const vehicle = useGameStore((state) => state.vehicle)
  const energyText = energyGaugeText(vehicle.energy, vehicle.energyMax)
  const hullText = hullGaugeText(vehicle.hull, vehicle.hullMax)
  const cargoText = cargoGaugeText(vehicle.cargoUnits, vehicle.cargoCapacity)

  return (
    <Panel title="Vehicle">
      <div className={styles.row}>
        <span>State</span>
        <span>{vehicle.mode}</span>
      </div>
      <div className={styles.row}>
        <span>Energy</span>
        <span>{energyText}</span>
      </div>
      <div className={styles.row}>
        <span>Hull</span>
        <span>{hullText}</span>
      </div>
      <div className={styles.row}>
        <span>Cargo</span>
        <span>{cargoText}</span>
      </div>
    </Panel>
  )
}
