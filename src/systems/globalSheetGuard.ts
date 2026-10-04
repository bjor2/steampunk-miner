/**
 * Rule for the page's global stylesheets: they hold tokens and element rules only. Every class
 * lives in a CSS Module beside its component (osilion-dev-tsr3f, group 4).
 */

/** The only non-module stylesheets, relative to src/. */
export const GLOBAL_SHEETS = ['ui/kit/tokens.css', 'ui/kit/base.css'] as const

export function isGlobalSheet(path: string): boolean {
  return path.endsWith('.css') && !path.endsWith('.module.css')
}

/** Class names a sheet declares in its selectors, ignoring comments and declaration bodies. */
export function parseGlobalClassNames(css: string): Set<string> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const selectors = withoutComments.replace(/\{[^}]*\}/g, '{}')
  const names = new Set<string>()
  for (const match of selectors.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) names.add(match[1])
  return names
}
