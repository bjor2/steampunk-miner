/** The slice pieces registered for one world layer, in id order; none renders nothing. */
import { worldPiecesOf, type WorldLayer } from './registries/worldPieces'

export function WorldPieces({ layer }: { layer: WorldLayer }) {
  return (
    <>
      {worldPiecesOf(layer).map(({ id, Piece }) => (
        <Piece key={id} />
      ))}
    </>
  )
}
