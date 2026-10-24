import { describe, expect, it } from 'vitest'
import { campaignIndex, planetIndexOfCampaign } from '../starMap/campaignIndex'
import { cmp, div, fromCanonical, toCanonical, toFixedText, type Money } from '../money'
import {
  destinationUnitPriceOf,
  fuelPriceOf,
  fuelUnitPriceOf,
  jumpFeeOf,
  jumpFuelUnitsOf,
  runValueOf,
} from './jumpFuel'

function expectAmount(amount: Money, text: string): void {
  expect(toCanonical(amount)).toBe(toCanonical(fromCanonical(text)))
}

/** The VS law's ratio from one planet's top band to the next: 1.5^3. */
const PLANET_RATIO = '3.375'

/**
 * The bignum goldens of the VS bars on #650 (s = 1, 2, 10, 1e6 and p = 1, 2, 5, 10, 40, 1000):
 * `[s, p, g, fee of the hop to g + 1, fee of the trip home from g + 1]`.
 */
const NEXT_HOP_GOLDENS: readonly (readonly [bigint, bigint, number, string, string])[] = [
  [1n, 1n, 1, '253.125', '75'],
  [1n, 2n, 2, '854.297', '253.125'],
  [1n, 5n, 5, '32842.042', '9730.976'],
  [1n, 10n, 10, '14381329.443', '4261134.65'],
  [1n, 40n, 40, '1.01394021884106167645526891e+23', '3.0042673150846271894970931e+22'],
  [
    1n,
    1000n,
    1000,
    '1.40876460150654079594269038521324908406e+530',
    '4.174117337797157913904267808039256545362e+529',
  ],
  [2n, 1n, 6, '110841.892', '32842.042'],
  [2n, 2n, 7, '374091.383', '110841.892'],
  [2n, 5n, 10, '14381329.443', '4261134.65'],
  [2n, 10n, 15, '6297496298.411', '1865924829.159'],
  [2n, 40n, 45, '4.4399822704193242726808908449e+25', '1.3155503023464664511647083985e+25'],
  [
    2n,
    1000n,
    1005,
    '6.168894119845402152309460958013637168885e+532',
    '1.827820479954193230313914357929966568559e+532',
  ],
  [10n, 1n, 46, '1.49849401626652194202980066014e+26', '4.4399822704193242726808908449e+25'],
  [10n, 2n, 47, '5.05741730489951155435057722797e+26', '1.49849401626652194202980066014e+26'],
  [10n, 5n, 50, '1.9442411096159587094586408511354e+28', '5.760714398862099879877454373735e+27'],
  [
    10n,
    10n,
    55,
    '8.513713033281310192218645605267991e+30',
    '2.522581639490758575472191290449776e+30',
  ],
  [
    10n,
    40n,
    85,
    '6.00250212655920471499373580259448897889e+46',
    '1.778519148610134730368514311879848586338e+46',
  ],
  [
    10n,
    1000n,
    1045,
    '8.339853138511180819896731318223456492445e+553',
    '2.471067596595905428117550020214357479243e+553',
  ],
  [
    1000000n,
    1n,
    4999996,
    '4.444279597412713556963736516623794399044e+2641368',
    '1.316823584418581794655921930851494636754e+2641368',
  ],
  [
    1000000n,
    2n,
    4999997,
    '1.499944364126790825475261074360530609677e+2641369',
    '4.444279597412713556963736516623794399044e+2641368',
  ],
  [
    1000000n,
    5n,
    5000000,
    '5.76629002326320777691983666535904765435e+2641370',
    '1.708530377263172674642914567513791897586e+2641370',
  ],
  [
    1000000n,
    10n,
    5000005,
    '2.52502317135106216164244026997153004153e+2641373',
    '7.48155013733648047894056376287860753046e+2641372',
  ],
  [
    1000000n,
    40n,
    5000035,
    '1.780240524480597439508247244537047115896e+2641389',
    '5.274786739201770191135547391220880343395e+2641388',
  ],
  [
    1000000n,
    1000n,
    5000995,
    '2.47345926954381075400241167772551623322e+2641896',
    '7.328768206055735567414553119186714765095e+2641895',
  ],
]

describe('star map fuel curve (ticket 756)', () => {
  it('burns U0 * (1 + 0.25 * distance) whole units, the same either way', () => {
    expectAmount(jumpFuelUnitsOf(1, 2), '5')
    expectAmount(jumpFuelUnitsOf(2, 1), '5')
    expectAmount(jumpFuelUnitsOf(1, 3), '6')
    expectAmount(jumpFuelUnitsOf(5, 1), '8')
    expectAmount(jumpFuelUnitsOf(40, 1000), '964')
  })

  it('charges the hop to the next planet half a run of the planet it leaves', () => {
    expectAmount(jumpFeeOf(1, 2), '253.125')
    expectAmount(jumpFeeOf(2, 3), '854.297')
  })

  it('stands R in as ten top-band ore units of the planet, and charges the next hop half of it', () => {
    expectAmount(runValueOf(1), '506.25')
    expect(toCanonical(jumpFeeOf(1, 2))).toBe(toCanonical(div(runValueOf(1), fromCanonical('2'))))
  })

  it('grows the unit price, and with it the hop to the next planet, by 3.375 a planet', () => {
    for (const planet of [1, 2, 5, 39, 999]) {
      const ratio = div(destinationUnitPriceOf(planet + 1), destinationUnitPriceOf(planet))
      expectAmount(ratio, PLANET_RATIO)
    }
  })

  it('keeps the 3.375 ratio to 30 places at campaign index 9,999,991 (s = 1e6, p = 1 today)', () => {
    const ratio = div(destinationUnitPriceOf(9999992), destinationUnitPriceOf(9999991))
    expect(toFixedText(ratio, 30)).toBe(`${PLANET_RATIO}${'0'.repeat(27)}`)
  })

  it('prices a jump at its destination, so the trip home is cheap but never free', () => {
    expectAmount(jumpFeeOf(2, 1), '75')
    expect(cmp(jumpFeeOf(2, 1), jumpFeeOf(1, 2))).toBe(-1)
    expect(cmp(jumpFeeOf(5, 1), jumpFeeOf(1, 2))).toBe(-1)
  })

  it('never charges a jump less than one unit at the destination price', () => {
    for (const [from, to] of [
      [2, 1],
      [1, 2],
      [7, 3],
      [3, 7],
    ]) {
      expect(cmp(jumpFeeOf(from, to), destinationUnitPriceOf(to))).toBeGreaterThan(0)
    }
  })

  it("sells fuel at the next planet's unit price, so fuel for the hop on pays its fee", () => {
    expectAmount(fuelUnitPriceOf(1), '50.625')
    for (const planet of [1, 3, 12]) {
      const units = jumpFuelUnitsOf(planet, planet + 1)
      const price = fuelPriceOf(planet, Number(toCanonical(units)))
      expect(toCanonical(price)).toBe(toCanonical(jumpFeeOf(planet, planet + 1)))
    }
  })

  it('holds the next-hop and trip-home goldens at every address of the VS grid, the same twice', () => {
    for (const [system, place, planetG, outFee, homeFee] of NEXT_HOP_GOLDENS) {
      const planet = planetIndexOfCampaign(campaignIndex(system, place))
      expect(planet).toBe(planetG)
      expectAmount(jumpFeeOf(planet, planet + 1), outFee)
      expectAmount(jumpFeeOf(planet + 1, planet), homeFee)
      expect(toCanonical(jumpFeeOf(planet, planet + 1))).toBe(toCanonical(fromCanonical(outFee)))
    }
  })
})
