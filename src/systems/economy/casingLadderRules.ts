/**
 * The casing ladder's rows of economy.json `casing` (ticket 829, the GD lock re-pinning #41 by
 * name): the grades a planet adds (`gradesPerPlanet`, 4), what a grade costs more a planet past the
 * first planet's bottom grade (`planetPriceRatio`, 3.375, so `r = 3.375^(1/4)` a grade) and the
 * bounds on a planet row's higher surface grade (`surfaceOffset`, `casingSurfaceOffsets.ts`). Read and checked here, so the
 * economy reader keeps one line for them.
 */
import { BASIS_POINTS } from '../../constants/balance'
import { cmp, fromSafeInteger, type BigStat, type Money } from '../money'
import type { FieldReader } from './economyFieldReader'

/** The bounds on a planet row's surface grade above the default (the GD re-lock on ticket 829). */
export interface CasingSurfaceOffsetRules {
  /** The most grades a row's surface may sit above the default: 1, no +2 for now. */
  maxLead: number
  /** The catch-up's largest share of the money held after the fuel fee, in basis points (8%). */
  catchUpShareBp: number
  /**
   * The median bot's money held after the fuel fee on arriving at a planet, as a lane run
   * measured it: the only wallet the guard trusts, so a planet with none takes no offset.
   */
  moneyHeldAfterFuel: readonly MeasuredMoneyHeld[]
}

export interface MeasuredMoneyHeld {
  planet: number
  money: Money
}

export interface CasingLadderRows {
  gradesPerPlanet: number
  planetPriceRatio: BigStat
  surfaceOffset: CasingSurfaceOffsetRules
}

const ONE = fromSafeInteger(1)

export function readCasingLadder(
  reader: FieldReader,
  casing: Record<string, unknown>,
): CasingLadderRows {
  const rows = {
    gradesPerPlanet: reader.safeInteger('casing.gradesPerPlanet', casing.gradesPerPlanet),
    planetPriceRatio: reader.money('casing.planetPriceRatio', casing.planetPriceRatio),
    surfaceOffset: readSurfaceOffset(reader, casing.surfaceOffset),
  }
  checkLadder(reader, rows)
  return rows
}

function readSurfaceOffset(reader: FieldReader, value: unknown): CasingSurfaceOffsetRules {
  const path = 'casing.surfaceOffset'
  const offset = reader.object(path, value)
  return {
    maxLead: reader.safeInteger(`${path}.maxLead`, offset.maxLead),
    catchUpShareBp: reader.safeInteger(`${path}.catchUpShareBp`, offset.catchUpShareBp),
    moneyHeldAfterFuel: reader
      .list(`${path}.moneyHeldAfterFuel`, offset.moneyHeldAfterFuel)
      .map((row, index) =>
        readMeasuredMoneyHeld(reader, `${path}.moneyHeldAfterFuel[${index}]`, row),
      ),
  }
}

function readMeasuredMoneyHeld(
  reader: FieldReader,
  path: string,
  value: unknown,
): MeasuredMoneyHeld {
  const row = reader.object(path, value)
  return {
    planet: reader.safeInteger(`${path}.planet`, row.planet),
    money: reader.money(`${path}.money`, row.money),
  }
}

function checkLadder(reader: FieldReader, rows: CasingLadderRows): void {
  const { gradesPerPlanet, planetPriceRatio, surfaceOffset } = rows
  if (gradesPerPlanet < 1) reader.record('casing.gradesPerPlanet must be 1 or more')
  if (cmp(planetPriceRatio, ONE) <= 0) reader.record('casing.planetPriceRatio must be above 1')
  if (surfaceOffset.maxLead < 0) reader.record('casing.surfaceOffset.maxLead must be 0 or more')
  if (!isShare(surfaceOffset.catchUpShareBp)) {
    reader.record('casing.surfaceOffset.catchUpShareBp must lie between 1 and 9999 basis points')
  }
}

function isShare(basisPoints: number): boolean {
  return basisPoints > 0 && basisPoints < BASIS_POINTS
}
