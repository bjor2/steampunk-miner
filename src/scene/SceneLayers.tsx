/** The slice layers of the world scene, in id order; none renders nothing (#213). */
import { sceneLayers } from './registries/sceneLayers'

export function SceneLayers() {
  return (
    <>
      {sceneLayers().map(({ id, Layer }) => (
        <Layer key={id} />
      ))}
    </>
  )
}
