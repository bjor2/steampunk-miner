/**
 * The slices the loader's glob found (docs/standards/feature-slices.md 3.3): each folder's
 * `register.ts` exports `slice`, whose id must equal the folder name. Two folders declaring one id
 * are refused naming both, before any registration.
 */
import type { SliceDefinition } from './sliceDefinition'

/** `register.ts` modules keyed by their glob path, `./<folder>/register.ts`. */
export type SliceModules = Readonly<Record<string, { slice: SliceDefinition }>>

interface FoundSlice {
  folder: string
  slice: SliceDefinition
}

export class SliceFolderError extends Error {
  constructor(problem: string) {
    super(problem)
    this.name = 'SliceFolderError'
  }
}

export function slicesOfModules(modules: SliceModules): SliceDefinition[] {
  const found = Object.entries(modules).map(([path, module]) => foundSliceOf(path, module.slice))
  refuseSharedIds(found)
  found.forEach(refuseMisnamedSlice)
  return found.map(({ slice }) => slice)
}

function foundSliceOf(path: string, slice: SliceDefinition): FoundSlice {
  const [, folder] = path.split('/')
  return { folder, slice }
}

function refuseSharedIds(found: readonly FoundSlice[]): void {
  found.forEach((first, index) => {
    const second = found.slice(index + 1).find(({ slice }) => slice.id === first.slice.id)
    if (second === undefined) return
    throw new SliceFolderError(
      `slice id "${first.slice.id}" is declared by src/features/${first.folder} and by src/features/${second.folder}`,
    )
  })
}

function refuseMisnamedSlice({ folder, slice }: FoundSlice): void {
  if (slice.id === folder) return
  throw new SliceFolderError(
    `src/features/${folder}/register.ts declares slice id "${slice.id}": a slice's id is its folder name`,
  )
}
