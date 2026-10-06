import { describe, expect, it } from 'vitest'
import { loadFeatures } from '.'

// Every vite-node entry is a composition root: it loads the slices before any game code reads a
// registry (docs/standards/feature-slices.md 3.3).
const SCRIPT_SOURCES = import.meta.glob<string>('../../scripts/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const IMPORTS_THE_LOADER = /^import \{ loadFeatures \} from '\.\.\/src\/features'$/m
const CALLS_THE_LOADER = /^loadFeatures\(\)$/m

function scriptsMissingTheLoader(): string[] {
  return Object.entries(SCRIPT_SOURCES)
    .filter(([, source]) => !IMPORTS_THE_LOADER.test(source) || !CALLS_THE_LOADER.test(source))
    .map(([path]) => path)
}

describe('feature loader', () => {
  it('returns the same slice list on a second call', () => {
    expect(loadFeatures()).toBe(loadFeatures())
  })

  it('is imported from src/features and called by every scripts/*.ts', () => {
    expect(Object.keys(SCRIPT_SOURCES).length).toBeGreaterThanOrEqual(11)
    expect(scriptsMissingTheLoader()).toEqual([])
  })
})
