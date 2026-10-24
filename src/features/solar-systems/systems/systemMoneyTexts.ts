/**
 * A drawn system's money as the player reads it (ticket 779, spec #774: "bignum goldens at s = 2,
 * 10, 1e6 through #681"): per planet the fuel fee to arrive, what one ore unit of band 1 and of band
 * 5 sells for, and the dearest gem's sale, each through the one compact formatter
 * (`displayAmount.ts`, ticket 681). A fee is a price, rounded up; a sale is money in, rounded
 * toward zero, as the Sell bay shows it. The amounts come from the economy rows (ticket 776), so
 * they stay bignum to the text and never pass through a double.
 */
import { formatAmount, formatPrice } from '../../../systems/displayAmount'
import { oreSalePrice } from '../../../systems/economy/oreEconomy'
import type { Money } from '../../../systems/money'
import { systemEconomyRowsOf, type PlanetEconomyRow } from './economyRows'

export interface PlanetMoneyTexts {
  /** `<s>·<p>`, the planet's address. */
  address: string
  arrivalFee: string
  bandOneSale: string
  bandFiveSale: string
  topGemSale: string
}

/** The money texts of every planet of system `system` (from 2), in place order. */
export function systemMoneyTextsOf(worldSeed: number, system: bigint): PlanetMoneyTexts[] {
  return systemEconomyRowsOf(worldSeed, system).map(moneyTextsOfRow)
}

/** Each planet's amounts behind the texts, in the same order: what a golden checks the texts by. */
export function systemMoneyAmountsOf(worldSeed: number, system: bigint): Money[][] {
  return systemEconomyRowsOf(worldSeed, system).map(moneyAmountsOfRow)
}

function moneyTextsOfRow(row: PlanetEconomyRow): PlanetMoneyTexts {
  const [fee, bandOne, bandFive, topGem] = moneyAmountsOfRow(row)
  return {
    address: `${row.id.system}·${row.id.planet}`,
    arrivalFee: formatPrice(fee),
    bandOneSale: formatAmount(bandOne),
    bandFiveSale: formatAmount(bandFive),
    topGemSale: formatAmount(topGem),
  }
}

/** The arrival fee, the band 1 and band 5 unit sales and the dearest gem's sale. */
function moneyAmountsOfRow(row: PlanetEconomyRow): Money[] {
  return [
    row.arrivalFee,
    oreSalePrice(row.bandTiers[0]),
    oreSalePrice(row.bandTiers[row.bandTiers.length - 1]),
    oreSalePrice(row.gemSaleTiers[row.gemSaleTiers.length - 1]),
  ]
}
