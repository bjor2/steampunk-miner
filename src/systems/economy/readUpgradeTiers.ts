/**
 * Reads `upgradeTiers` (#180 sections 3 and 4, Systems): `minorsPerMajor` steps to a major, at
 * least 2 so a major has a pip before its big level-up, and `minorStatShare`, a decimal share from
 * 0 to 1 the pips are given of a major's gain. The share is kept as a fraction in lowest terms, so
 * the cargo and boiler pips round in integers and the drill pips take a whole root.
 */
import { fromCanonical, mul, toSafeInteger } from '../money'
import type { StatShare, UpgradeTiers } from './economyDefinition'
import type { FieldReader } from './economyFieldReader'
import { lowestTerms } from '../wholeFractions'

const SHARE_TEXT = /^(?:0|1)(?:\.(\d+))?$/

export function readUpgradeTiers(reader: FieldReader, value: unknown): UpgradeTiers {
  const tiers = reader.object('upgradeTiers', value)
  return {
    minorsPerMajor: readMinorsPerMajor(reader, tiers.minorsPerMajor),
    minorStatShare: readStatShare(reader, 'upgradeTiers.minorStatShare', tiers.minorStatShare),
  }
}

function readMinorsPerMajor(reader: FieldReader, value: unknown): number {
  const minors = reader.safeInteger('upgradeTiers.minorsPerMajor', value)
  if (minors <= 1) reader.record('upgradeTiers.minorsPerMajor must be more than 1')
  return minors
}

/** A decimal string over 0 and at most 1, such as "0.5", as `{numerator, denominator}`. */
function readStatShare(reader: FieldReader, path: string, value: unknown): StatShare {
  const text = reader.text(path, value)
  const share = shareOfText(text)
  if (share === null) reader.record(`${path} must be a decimal string over 0 and at most 1`)
  return share ?? { numerator: 1, denominator: 1 }
}

function shareOfText(text: string): StatShare | null {
  const match = SHARE_TEXT.exec(text)
  if (match === null) return null
  const decimals = match[1] ?? ''
  const scale = fromCanonical(`1e${decimals.length}`)
  const numerator = toSafeInteger(mul(fromCanonical(text), scale))
  const denominator = toSafeInteger(scale)
  if (numerator === 0 || numerator > denominator) return null
  return lowestTerms(numerator, denominator)
}
