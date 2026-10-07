/** The slice pieces on the local vehicle, in id order; none renders nothing (#235). */
import { vehiclePieces } from './registries/vehiclePieces'

export function VehiclePieces() {
  return (
    <>
      {vehiclePieces().map(({ id, Piece }) => (
        <Piece key={id} />
      ))}
    </>
  )
}
