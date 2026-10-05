import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// #23 acceptance, #20 rounding rule: `ceilMilli` on every charge, `floorMilli` on the per-unit ore
// sale price, and no other rounding function in a money path. The platform rules add, subtract and
// multiply prices; only the price functions round. The tow's fee is `rescueFee` (planetCharges);
// the `ceil` in vehicleTransitions rounds the tow's energy floor in quanta, not money.

const ROUNDING = ['floor', 'ceil', 'roundToWhole', 'ceilMilli', 'floorMilli']

function moneyImportsOf(path: string): string[] {
  const code = readFileSync(new URL(path, import.meta.url), 'utf8')
  const imports = code.match(/import\s*{([^}]*)}\s*from\s*'\.\.\/money'/)
  return (imports?.[1] ?? '').split(',').map((name) => name.trim().replace(/^type\s+/, ''))
}

const roundingIn = (path: string) => moneyImportsOf(path).filter((name) => ROUNDING.includes(name))

describe('money rounding', () => {
  it('leaves rounding to the price functions in every platform money path', () => {
    const platformPaths = [
      './platformServices.ts',
      './workshopRules.ts',
      './dockRules.ts',
      './coreBay.ts',
    ]
    expect(platformPaths.flatMap(roundingIn)).toEqual([])
  })

  it('rounds charges up to 0.001 and the ore sale price down to 0.001', () => {
    expect(roundingIn('../economy/planetCharges.ts')).toEqual(['ceilMilli'])
    expect(roundingIn('../economy/oreEconomy.ts')).toEqual(['floorMilli'])
  })

  it('rounds upgrade prices only to the whole number the #6 curve defines', () => {
    expect(roundingIn('../economy/upgradePrices.ts')).toEqual(['ceil'])
  })
})
