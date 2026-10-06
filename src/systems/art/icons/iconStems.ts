/**
 * Icon files by id (docs/standards/feature-slices.md 3.4): the kernel's `src/ui/icons/` and every
 * slice's `icons/` folder ship SVGs, and the file stem is the icon id in both. A slice adds an icon
 * by adding a file. One stem shipped from two folders is a coverage failure, never a silent pick.
 */

const SVG_EXTENSION = '.svg'

/** `../features/ores/icons/icon-ore-x.svg` answers to `icon-ore-x`. */
export function iconStemOf(path: string): string {
  const fileName = path.slice(path.lastIndexOf('/') + 1)
  if (!fileName.endsWith(SVG_EXTENSION)) return fileName
  return fileName.slice(0, fileName.length - SVG_EXTENSION.length)
}

/** Each stem's URL; where two folders ship one stem, the first path in code-unit order. */
export function iconUrlsByStem(urlsByPath: Readonly<Record<string, string>>): Map<string, string> {
  const urls = new Map<string, string>()
  for (const path of sortedPaths(urlsByPath)) {
    const stem = iconStemOf(path)
    if (!urls.has(stem)) urls.set(stem, urlsByPath[path])
  }
  return urls
}

/** The stems more than one folder ships, each once, sorted. */
export function duplicatedIconStems(paths: readonly string[]): string[] {
  const stems = paths.map(iconStemOf)
  const repeated = stems.filter((stem, index) => stems.indexOf(stem) !== index)
  return [...new Set(repeated)].sort()
}

function sortedPaths(urlsByPath: Readonly<Record<string, string>>): string[] {
  return Object.keys(urlsByPath).sort((a, b) => (a === b ? 0 : a < b ? -1 : 1))
}
