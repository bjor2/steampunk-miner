/**
 * The ore catalogue's data (#140 "Numbers", #141 family table), read once from the slice's two
 * files and refused whole when broken, so a bad row fails at load with every problem listed.
 *
 * - `ores.economy.json`: the rarity lead weights per band, the signature value lead and share caps,
 *   and the catalogue knobs. #140 writes the weights as fractions (`plus1` 0.05); they are stored
 *   in basis points so the generation hook rolls them in integers and no fraction collides with
 *   the economy source scan.
 * - `oreFamilies.json`: #141's 12 families in its table order. A family's place in the list is its
 *   code in the cell's 4-bit family field, plus one (`metal` 1 and `crystal` 2, as the kernel's
 *   `RESOURCE_FAMILY` already writes them), so the order is append-only.
 */
import { BAND_COUNT } from '../../../systems/world/planetGeometry'
import economyFile from '../ores.economy.json'
import familiesFile from '../oreFamilies.json'

export interface OreFamily {
  id: string
  /** #141's display name; the type name is `<gradeName> <name>`. */
  name: string
  /** The value of the cell's 4-bit family field. */
  cellCode: number
}

/** Basis points of a band's ore patches that roll a +1 or +2 rarity lead (#140). */
export interface LeadWeights {
  plus1Bp: number
  plus2Bp: number
}

export interface CatalogueKnobs {
  variantsPerFamily: number
  echoEvery: number
  echoFrom: number
}

export interface OreRows {
  families: readonly OreFamily[]
  /** Bands 1 to 5. */
  leadWeightsByBand: readonly LeadWeights[]
  signatureValueLead: number
  /** Bands 4 and 5 only; the world generator clamps a signature's share to it (#140, #141). */
  signatureShareCapBpByBand: Readonly<Record<string, number>>
  catalogue: CatalogueKnobs
}

/** The 4-bit field holds 15 families; 0 is `none`. */
export const MAX_FAMILY_CODE = 15

const BASIS_POINTS = 10000
const SIGNATURE_BANDS = ['4', '5']
const FAMILY_ID = /^[a-z]+$/

type Raw = Record<string, unknown>

export const ORE_ROWS: OreRows = loadOreRows(economyFile, familiesFile)

/** Why the two files are not the #140/#141 data; empty when they are. */
export function oreRowProblems(economy: unknown, families: unknown): string[] {
  const ore = ((economy as Raw).ore ?? {}) as Raw
  return [
    ...familyListProblems((families as Raw).families),
    ...leadWeightProblems(ore.leadWeightsBpByBand as Raw | undefined),
    ...(isWhole(ore.signatureValueLead, 0) ? [] : ['ore.signatureValueLead must be whole, from 0']),
    ...signatureCapProblems(ore.signatureShareCapBpByBand as Raw | undefined),
    ...catalogueProblems(ore.catalogue as Raw | undefined),
  ]
}

function loadOreRows(economy: typeof economyFile, families: typeof familiesFile): OreRows {
  const problems = oreRowProblems(economy, families)
  if (problems.length > 0)
    throw new Error(`The ores slice data is refused:\n${problems.join('\n')}`)
  const { leadWeightsBpByBand: weights, ...ore } = economy.ore
  return {
    families: families.families.map((family, at) => ({ ...family, cellCode: at + 1 })),
    leadWeightsByBand: weights.plus1.map((plus1Bp, at) => ({
      plus1Bp,
      plus2Bp: weights.plus2[at],
    })),
    signatureValueLead: ore.signatureValueLead,
    signatureShareCapBpByBand: ore.signatureShareCapBpByBand,
    catalogue: ore.catalogue,
  }
}

function familyListProblems(families: unknown): string[] {
  if (!Array.isArray(families) || families.length === 0) return ['families must be a list']
  const rows = families as Raw[]
  const ids = rows.map((family) => String(family.id))
  return [
    ...(rows.length <= MAX_FAMILY_CODE ? [] : [`at most ${MAX_FAMILY_CODE} families fit a cell`]),
    ...rows.flatMap(familyRowProblems),
    ...ids.filter((id, at) => ids.indexOf(id) !== at).map((id) => `family "${id}" is listed twice`),
  ]
}

function familyRowProblems(family: Raw, at: number): string[] {
  const isNamed = typeof family.name === 'string' && family.name !== ''
  return [
    ...(FAMILY_ID.test(String(family.id)) ? [] : [`families[${at}].id must be lower-case letters`]),
    ...(isNamed ? [] : [`families[${at}].name must name the family`]),
  ]
}

function leadWeightProblems(weights: Raw | undefined): string[] {
  const plus1 = basisPointRow(weights?.plus1)
  const plus2 = basisPointRow(weights?.plus2)
  if (plus1 === null || plus2 === null) {
    return [`ore.leadWeightsBpByBand needs plus1 and plus2: ${BAND_COUNT} basis points each`]
  }
  return plus1
    .map((weight, at) => ({ band: at + 1, total: weight + plus2[at] }))
    .filter(({ total }) => total > BASIS_POINTS)
    .map(({ band }) => `band ${band}'s lead weights add up to more than ${BASIS_POINTS}`)
}

function basisPointRow(row: unknown): number[] | null {
  if (!Array.isArray(row) || row.length !== BAND_COUNT) return null
  return row.every((weight) => isWhole(weight, 0) && weight <= BASIS_POINTS) ? row : null
}

function signatureCapProblems(caps: Raw | undefined): string[] {
  const keys = Object.keys(caps ?? {}).sort()
  const isBands = keys.join() === SIGNATURE_BANDS.join()
  const isBasisPoints = keys.every(
    (key) => isWhole(caps?.[key], 0) && (caps?.[key] as number) <= BASIS_POINTS,
  )
  return isBands && isBasisPoints
    ? []
    : ['ore.signatureShareCapBpByBand must give bands 4 and 5 a cap in basis points']
}

function catalogueProblems(catalogue: Raw | undefined): string[] {
  return (['variantsPerFamily', 'echoEvery', 'echoFrom'] as const)
    .filter((knob) => !isWhole(catalogue?.[knob], 1))
    .map((knob) => `ore.catalogue.${knob} must be a whole number from 1`)
}

function isWhole(value: unknown, from: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= from
}
