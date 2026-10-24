import { describe, expect, it } from 'vitest'
import { cmp, fromCanonical, type Money } from '../../../systems/money'
import { systemMoneyAmountsOf, systemMoneyTextsOf, type PlanetMoneyTexts } from './systemMoneyTexts'

// The bignum goldens of ticket 779 (spec #774: goldens at s = 2, 10 and 1e6 through #681, the
// re-baseline named "solar system 2"): under the roster golden's seed, the money a player reads on
// each planet of systems 2, 10 and 1e6 (the fee to arrive, a band 1 and a band 5 ore unit's sale,
// the dearest gem's sale), as the one compact formatter prints it. The texts are spelled out, so a
// moved row reads as a moved text. A change to J, the fuel rows, V(t), the gem ladder or the
// formatter re-pins them with its ticket.

const SEED = 20261024
/** #681: at most 6 characters up to 1e300. */
const SHORT_TEXT_MAX_CHARS = 6
const SHORT_TEXT_BELOW = fromCanonical('1e300')

const GOLDEN: Record<string, readonly (readonly string[])[]> = {
  system2: [
    ['2·1', '46.0k', '4,378', '22.1k', '2.87M'],
    ['2·2', '111k', '14.7k', '74.8k', '9.70M'],
    ['2·3', '375k', '49.8k', '252k', '32.7M'],
    ['2·4', '1.27M', '168k', '852k', '110M'],
    ['2·5', '4.27M', '568k', '2.87M', '373M'],
  ],
  system10: [
    ['10·1', '62.2Sp', '5.91Sp', '29.9Sp', '3.88Oc'],
    ['10·2', '150Sp', '19.9Sp', '101Sp', '13.1Oc'],
    ['10·3', '506Sp', '67.4Sp', '341Sp', '44.2Oc'],
    ['10·4', '1.71Oc', '227Sp', '1.15Oc', '149Oc'],
    ['10·5', '5.77Oc', '768Sp', '3.88Oc', '504Oc'],
  ],
  system1e6: [
    ['1000000·1', '2e2641368', '1e2641367', '8e2641367', '1e2641370'],
    ['1000000·2', '5e2641368', '5e2641367', '2e2641368', '3e2641370'],
    ['1000000·3', '2e2641369', '1e2641368', '1e2641369', '1e2641371'],
    ['1000000·4', '6e2641369', '6e2641368', '3e2641369', '4e2641371'],
    ['1000000·5', '2e2641370', '2e2641369', '1e2641370', '1e2641372'],
  ],
}

const SYSTEMS: readonly [string, bigint][] = [
  ['system2', 2n],
  ['system10', 10n],
  ['system1e6', 1_000_000n],
]

function cellsOf(texts: PlanetMoneyTexts): string[] {
  return [texts.address, texts.arrivalFee, texts.bandOneSale, texts.bandFiveSale, texts.topGemSale]
}

function amountTextsOf(texts: PlanetMoneyTexts): string[] {
  return cellsOf(texts).slice(1)
}

describe('solar system money texts golden: solar system 2 (ticket 779)', () => {
  it.each(SYSTEMS)('prints %s of seed 20261024 as pinned, through the #681 formatter', (key, s) => {
    expect(systemMoneyTextsOf(SEED, s).map(cellsOf)).toEqual(GOLDEN[key])
  })

  it('prints the same texts on every read, and never NaN, Infinity or MAX', () => {
    SYSTEMS.forEach(([, s]) => {
      const texts = systemMoneyTextsOf(SEED, s).flatMap(amountTextsOf)
      expect(systemMoneyTextsOf(SEED, s).flatMap(amountTextsOf)).toEqual(texts)
      texts.forEach((text) => expect(text).not.toMatch(/NaN|Infinity|MAX/))
    })
  })

  it('keeps every text of systems 2 and 10 inside 6 characters, their amounts under 1e300', () => {
    const shortSystems = [2n, 10n]
    const amounts = shortSystems.flatMap((s) => systemMoneyAmountsOf(SEED, s).flat())
    const texts = shortSystems.flatMap((s) => systemMoneyTextsOf(SEED, s).flatMap(amountTextsOf))
    expect(amounts.every((amount: Money) => cmp(amount, SHORT_TEXT_BELOW) < 0)).toBe(true)
    expect(texts.filter((text) => text.length > SHORT_TEXT_MAX_CHARS)).toEqual([])
  })
})
