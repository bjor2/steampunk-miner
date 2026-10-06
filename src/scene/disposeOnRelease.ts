/**
 * Frees a geometry or material a component created itself once the component unmounts or a memo
 * replaces it (#118). R3F 8 disposes only what it builds from JSX: a `<primitive>` is never
 * disposed, and its recursive `dispose` helper walks property names, not values, so an object
 * handed over as a `geometry`/`material` prop is skipped (@react-three/fiber events-*.cjs
 * `removeChild` and `dispose`). Three frees the GPU copy on the object's `dispose` event, so
 * without this every Canvas remount, HMR or look change grows `renderer.info.memory`.
 *
 * Never pass an object a loader cache shares (atlas textures): other parts still draw with it.
 */
import { useEffect } from 'react'

/** A geometry or material: three uploads it on first draw and frees it on `dispose()`. */
interface GpuResource {
  dispose(): void
}

export function useDisposeOnRelease(resource: GpuResource): void {
  useEffect(() => () => resource.dispose(), [resource])
}

/** The same for a memoised list; a new list frees the old one's members. */
export function useDisposeEachOnRelease(resources: readonly GpuResource[]): void {
  useEffect(() => () => disposeEach(resources), [resources])
}

function disposeEach(resources: readonly GpuResource[]): void {
  for (const resource of resources) resource.dispose()
}
