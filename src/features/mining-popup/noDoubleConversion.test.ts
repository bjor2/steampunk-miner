import { describe, expect, it } from 'vitest'

// TD on #178: no `Number(` or `toFixed` anywhere in the slice, the descriptions slice's ban (#164),
// so the plaque's price reaches the screen as Money through formatAmount, never as a double.
const SOURCES = import.meta.glob<string>(['./**/*.{ts,tsx}', '!./**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

const DOUBLE_CONVERSION = /\bNumber\(|\.toFixed\(|\.toPrecision\(|\.toLocaleString\(|parseFloat\(/

function sourcesConvertingThroughADouble(): string[] {
  return Object.entries(SOURCES)
    .filter(([, source]) => DOUBLE_CONVERSION.test(source))
    .map(([path]) => path)
}

describe('mining popup money display', () => {
  it('never turns a number into a double on its way to the screen', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(10)
    expect(sourcesConvertingThroughADouble()).toEqual([])
  })
})
