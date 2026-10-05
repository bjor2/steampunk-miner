import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fromCanonical, mul, toCanonical, type Money } from '../money'
import {
  enemyStatsTable,
  planetEconomyTable,
  planetPriceTable,
  vehicleStatsTable,
} from './economyTables'

// The committed tables in docs/economy/ were rendered by docs/economy/tools/gen.py. This spec
// renders the game's formulas with the same Python formatting and compares cell by cell.

const PLANET_COUNT = 40
const BAND_1 = 0
const BAND_3 = 2
const BAND_5 = 4

function committedTable(fileName: string): string[][] {
  const text = readFileSync(new URL(`../../../docs/economy/${fileName}`, import.meta.url), 'utf8')
  const rows = text.split('\n').filter((line) => line.startsWith('|'))
  return rows.slice(2).map((row) =>
    row
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim()),
  )
}

// --- Python's float formatting, emulated on the double's exact decimal digits -----------------

interface ExactDigits {
  digits: string
  /** Power of ten of the first digit. */
  exponent: number
}

/** The double's own digits (100 significant are enough for every value in these tables). */
function exactDigitsOf(value: number): ExactDigits {
  const [mantissa, exponent] = Math.abs(value).toExponential(99).split('e')
  return { digits: mantissa.replace('.', ''), exponent: Number(exponent) }
}

/** Keeps `keep` leading digits, rounding half to even as Python's formatting does. */
function roundHalfEven({ digits, exponent }: ExactDigits, keep: number): ExactDigits {
  if (keep < 0) return { digits: '0', exponent: exponent - keep }
  if (keep === 0) return { digits: isAboveHalf(digits) ? '1' : '0', exponent: exponent + 1 }
  const kept = digits.slice(0, keep).padEnd(keep, '0')
  const rest = digits.slice(keep)
  const isTie = rest[0] === '5' && !/[1-9]/.test(rest.slice(1))
  const isLastOdd = Number(kept[kept.length - 1]) % 2 === 1
  if (!(isAboveHalf(rest) || (isTie && isLastOdd))) return { digits: kept, exponent }
  const raised = (BigInt(kept) + 1n).toString()
  return raised.length > keep
    ? { digits: raised.slice(0, keep), exponent: exponent + 1 }
    : { digits: raised, exponent }
}

/** Whether dropped digits are more than half a unit of the last kept digit. */
function isAboveHalf(dropped: string): boolean {
  return dropped[0] > '5' || (dropped[0] === '5' && /[1-9]/.test(dropped.slice(1)))
}

/** Python `f"{x:.{decimals}f}"`. */
function pythonFixed(value: number, decimals: number): string {
  if (value === 0) return (0).toFixed(decimals)
  const exact = exactDigitsOf(value)
  const rounded = roundHalfEven(exact, exact.exponent + 1 + decimals)
  const shift = rounded.exponent + 1 + decimals - rounded.digits.length
  const units = BigInt(rounded.digits) * 10n ** BigInt(Math.max(0, shift))
  const text = units.toString().padStart(decimals + 1, '0')
  const sign = value < 0 ? '-' : ''
  return decimals === 0
    ? `${sign}${text}`
    : `${sign}${text.slice(0, -decimals)}.${text.slice(-decimals)}`
}

/** Python `f"{x:.{significant}g}"`. */
function pythonGeneral(value: number, significant: number): string {
  const rounded = roundHalfEven(exactDigitsOf(value), significant)
  if (rounded.exponent < -4 || rounded.exponent >= significant) {
    const mantissa = stripZeros(`${rounded.digits[0]}.${rounded.digits.slice(1)}`)
    const sign = rounded.exponent < 0 ? '-' : '+'
    return `${mantissa}e${sign}${String(Math.abs(rounded.exponent)).padStart(2, '0')}`
  }
  return stripZeros(pythonFixed(value, Math.max(0, significant - 1 - rounded.exponent)))
}

function stripZeros(text: string): string {
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text
}

function groupThousands(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** The whole part of a money amount, truncated as Python's `int(Decimal)`. */
function wholePart(amount: Money): string {
  const [mantissa, exponent] = toCanonical(amount).split('e')
  const digits = mantissa.replace('.', '')
  return digits.slice(0, Number(exponent) + 1).padEnd(Number(exponent) + 1, '0')
}

/** gen.py's `f(x, sig=3)`. */
function tableNumber(amount: Money, significant = 3): string {
  const canonical = toCanonical(amount)
  const [mantissa, exponentText] = canonical.split('e')
  const exponent = Number(exponentText)
  if (canonical === '0e+0') return '0'
  if (exponent >= 3 && exponent < 6) return groupThousands(wholePart(amount))
  if (exponent < 6) return pythonGeneral(Number(canonical), significant)
  return `${pythonFixed(Number(mantissa), 2)}e${exponent}`
}

const percent = (share: Money) => Number(toCanonical(mul(share, fromCanonical('100'))))
const seconds = (value: Money) => Number(toCanonical(value))

// --- the four tables ----------------------------------------------------------------------------

describe('economy tables', () => {
  it('renders table A (world and ore) for planets 1 to 40 as committed', () => {
    const rendered = planetEconomyTable(PLANET_COUNT).map((row) => [
      String(row.planetIndex),
      String(row.radiusTiles),
      String(row.coreRadiusTiles),
      String(row.coreTileCount),
      String(row.coreFragmentsNeeded),
      tableNumber(row.oreValueByBand[BAND_1]),
      tableNumber(row.oreValueByBand[BAND_5]),
      tableNumber(row.coreMaterialValue),
      tableNumber(row.hardnessByBand[BAND_5]),
      tableNumber(row.coreHardness),
    ])
    expect(rendered).toEqual(committedTable('planet-table.md'))
  })

  it('renders table B (on-curve vehicle) for planets 1 to 40 as committed', () => {
    const rendered = vehicleStatsTable(PLANET_COUNT).map(({ planetIndex, levels, stats }) => [
      String(planetIndex),
      String(levels.drill_power),
      tableNumber(stats.drillPower),
      String(levels.drill_tip),
      String(levels.hull),
      tableNumber(stats.hullMax),
      String(levels.cargo_hold),
      String(stats.cargoCapacity),
      String(levels.boiler),
      String(stats.energyMax),
      String(levels.engine),
      pythonFixed(stats.engine.speedMax, 1),
    ])
    expect(rendered).toEqual(committedTable('vehicle-table.md'))
  })

  it('renders table C (prices and charges) for planets 1 to 40 as committed', () => {
    const rendered = planetPriceTable(PLANET_COUNT).map((row) => [
      String(row.planetIndex),
      tableNumber(row.drillPowerNext),
      tableNumber(row.drillTipNext),
      tableNumber(row.hullNext),
      tableNumber(row.energyUnitPrice, 2),
      tableNumber(row.fullRepair),
      tableNumber(row.rescueFeeFloor),
      tableNumber(row.rescueFeeCap),
      tableNumber(row.travelFee),
    ])
    expect(rendered).toEqual(committedTable('price-table.md'))
  })

  it('renders table D (crawler against on-curve and one-planet-behind players) as committed', () => {
    const rendered = enemyStatsTable('crawler', PLANET_COUNT).map((row) => [
      String(row.planetIndex),
      `${row.tierByBand[BAND_1]}..${row.tierByBand[BAND_5]}`,
      tableNumber(row.healthByBand[BAND_3]),
      tableNumber(row.baseHitByBand[BAND_3]),
      [BAND_1, BAND_3, BAND_5]
        .map((band) => pythonFixed(seconds(row.killSecondsByBand[band]), 2))
        .join(' / '),
      [BAND_1, BAND_3, BAND_5]
        .map((band) => pythonFixed(percent(row.sideHitShareByBand[band]), 1))
        .join(' / '),
      row.behindKillSecondsByBand.length === 0
        ? 'n/a'
        : `${pythonFixed(seconds(row.behindKillSecondsByBand[BAND_3]), 2)} / ${pythonFixed(percent(row.behindSideHitShareByBand[BAND_3]), 0)}%`,
    ])
    expect(rendered).toEqual(committedTable('enemy-table.md'))
  })
})

describe('economy tables: Python number formatting', () => {
  it.each([
    [11.25, 3, '11.2'],
    [60.75, 3, '60.8'],
    [0.045, 2, '0.045'],
    [220.5, 2, '2.2e+02'],
    [6.5498, 3, '6.55'],
    [125.44, 3, '125'],
  ])('formats %d with %d significant digits as %s', (value, significant, text) => {
    expect(pythonGeneral(value, significant)).toBe(text)
  })
})
