/**
 * The coal tender's look ladder (ticket 758; the GD lock on #650: the fuel tank "shows on the rig
 * as a coal tender wagon on the #576 ladder"): which wagon the rig draws at its hitch for a tank
 * level, and above the top step the log tail (ticket 809): one finish a purchase, cycled, and pips
 * counting decades of tank capacity, in integer maths only. A pure function of the level alone (HS
 * on #576), read from `fuelTender.json`; the table is refused whole at load, every problem listed,
 * so a broken row fails the specs and the game's start, never a frame. The tank's level is
 * `vehicleFuel.ts`'s `fuelTankLevelOf`, 1 before the first purchase.
 */
import TABLE from '../../data/vehicle/fuelTender.json'
import { isHexColour } from './colour'

export interface FuelTenderStep {
  /** The first tank level that shows the part. */
  fromLevel: number
  part: string
  /** Progression's step name, as the Workshop's plaque would print it. */
  card: string
}

/** A finish the tail wears: a material named in 3 words or fewer, in its colour. */
export interface FuelTenderFinish {
  name: string
  /** `#rrggbb`. */
  colour: string
}

export interface FuelTenderTail {
  /** Purchases per tail step (the GD lock on #576: 1; the tender keeps it under ticket 809). */
  delta: number
  /** Tank levels that raise its capacity tenfold: ceil(ln 10 / ln 1.3), economy.json's ratio. */
  decadeStep: number
  /** One per tail step, cycling; at least `decadeStep / delta`, so finish and pips never repeat. */
  finishes: readonly FuelTenderFinish[]
  /** The glow the finish paints with, under the rig body's cap. */
  glow: number
}

export interface FuelTenderTable {
  assetId: string
  attach: string
  /** The draw order of every wagon part, behind the rig (#52 `z`). */
  z: number
  steps: readonly FuelTenderStep[]
  tail: FuelTenderTail
}

/** What the rig shows at a tank level. */
export interface FuelTenderLook {
  partId: string
  card: string
  /** The step shown, 0 for the first. */
  step: number
  /** Tail steps above the top step, 0 on or below it. */
  tail: number
  /** The tail's finish colour, null on or below the top step. */
  tint: string | null
  /** The tail's finish name for the hover line, null on or below the top step. */
  finish: string | null
  /** Decades of tank capacity the tail's pips count, 0 on or below the top step. */
  pips: number
  glow: number
}

/** The level every vehicle starts at, before any tank purchase (`economy/fuelTank.ts`). */
const FIRST_LEVEL = 1
const FINISHES_MAX = 12
const BAND_NAME_WORDS_MAX = 3

export class FuelTenderTableError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`fuelTender.json: ${problems.join('; ')}`)
    this.name = 'FuelTenderTableError'
  }
}

/** `table` once it passes every check. */
export function readFuelTenderTable(table: FuelTenderTable): FuelTenderTable {
  const problems = fuelTenderTableProblemsOf(table)
  if (problems.length > 0) throw new FuelTenderTableError(problems)
  return table
}

export const FUEL_TENDER_TABLE: FuelTenderTable = readFuelTenderTable(TABLE)

export function fuelTenderLookOf(
  level: number,
  table: FuelTenderTable = FUEL_TENDER_TABLE,
): FuelTenderLook {
  const step = stepIndexAt(table.steps, level)
  const tail = tailStepsAt(table, level)
  const finish = finishAt(table.tail, tail)
  return {
    partId: table.steps[step].part,
    card: table.steps[step].card,
    step,
    tail,
    tint: finish?.colour ?? null,
    finish: finish?.name ?? null,
    pips: tail === 0 ? 0 : decadesAt(table.tail, level),
    glow: finish === null ? 0 : table.tail.glow,
  }
}

/** Every wagon part, in step order. */
export function fuelTenderPartIds(table: FuelTenderTable = FUEL_TENDER_TABLE): string[] {
  return table.steps.map((step) => step.part)
}

/** The highest step whose level the tank has reached; the first for any level below it. */
function stepIndexAt(steps: readonly FuelTenderStep[], level: number): number {
  let reached = 0
  steps.forEach((step, at) => {
    if (level >= step.fromLevel) reached = at
  })
  return reached
}

/** Whole tail steps past the top step: `delta` purchases each. */
function tailStepsAt(table: FuelTenderTable, level: number): number {
  const top = table.steps[table.steps.length - 1].fromLevel
  return level <= top ? 0 : Math.floor((level - top) / table.tail.delta)
}

/** The tail step reached from 1 wears the first finish, and the cycle wraps. */
function finishAt(tail: FuelTenderTail, tailStep: number): FuelTenderFinish | null {
  if (tailStep === 0) return null
  return tail.finishes[(tailStep - 1) % tail.finishes.length]
}

/** Whole decades of capacity over the starting tank: integer division, no float power. */
function decadesAt(tail: FuelTenderTail, level: number): number {
  return Math.floor((level - FIRST_LEVEL) / tail.decadeStep)
}

/** Every problem with `table`; empty when it is sound. */
export function fuelTenderTableProblemsOf(table: FuelTenderTable): string[] {
  return [...stepProblemsOf(table.steps), ...tailProblemsOf(table.tail), ...orderProblemsOf(table)]
}

function stepProblemsOf(steps: readonly FuelTenderStep[]): string[] {
  const problems: string[] = []
  if (steps.length === 0) problems.push('steps: at least one step')
  if (steps[0] !== undefined && steps[0].fromLevel !== FIRST_LEVEL) {
    problems.push(`steps: the first step is the starting tank, level ${FIRST_LEVEL}`)
  }
  for (const step of steps) {
    if (!Number.isSafeInteger(step.fromLevel) || step.fromLevel < FIRST_LEVEL) {
      problems.push(`step "${step.part}": fromLevel must be a whole level from ${FIRST_LEVEL}`)
    }
    if (step.card.trim() === '') problems.push(`step "${step.part}": card must be a name`)
  }
  return [...problems, ...repeatProblemsOf(steps)]
}

function repeatProblemsOf(steps: readonly FuelTenderStep[]): string[] {
  const parts = steps.map((step) => step.part)
  return parts
    .filter((part, at) => parts.indexOf(part) !== at)
    .map((part) => `step "${part}": part is listed twice`)
}

function orderProblemsOf(table: FuelTenderTable): string[] {
  const problems: string[] = []
  for (let at = 1; at < table.steps.length; at++) {
    if (table.steps[at].fromLevel <= table.steps[at - 1].fromLevel) {
      problems.push(`step "${table.steps[at].part}": fromLevel must rise`)
    }
  }
  if (
    table.steps.length > 0 &&
    table.steps[0].fromLevel === FIRST_LEVEL &&
    table.steps.length < 2
  ) {
    problems.push('steps: the first purchase must change the wagon (one step past the start)')
  }
  return problems
}

function tailProblemsOf(tail: FuelTenderTail): string[] {
  const problems: string[] = []
  if (!Number.isSafeInteger(tail.delta) || tail.delta < 1)
    problems.push('tail.delta must be 1 or more')
  if (!Number.isSafeInteger(tail.decadeStep) || tail.decadeStep < 1)
    problems.push('tail.decadeStep must be 1 or more')
  problems.push(...finishCountProblemsOf(tail))
  for (const { name, colour } of tail.finishes) {
    if (!isHexColour(colour)) problems.push(`tail.finishes: "${colour}" is not #rrggbb`)
    if (!isBandName(name)) problems.push(`tail.finishes: "${name}" is not 1 to 3 words`)
  }
  if (!(tail.glow > 0 && tail.glow < 1)) problems.push('tail.glow must lie between 0 and 1')
  return [...problems, ...neighbourProblemsOf(tail.finishes)]
}

/** Enough finishes that two tail steps sharing one are a decade of capacity apart. */
function finishCountProblemsOf(tail: FuelTenderTail): string[] {
  const needed = Math.max(2, Math.ceil(tail.decadeStep / tail.delta))
  const count = tail.finishes.length
  return count >= needed && count <= FINISHES_MAX
    ? []
    : [`tail.finishes must hold ${needed} to ${FINISHES_MAX} finishes`]
}

function isBandName(name: string): boolean {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
  return words.length >= 1 && words.length <= BAND_NAME_WORDS_MAX
}

/** No two neighbouring tail steps alike, the wrap included, so neighbouring purchases differ. */
function neighbourProblemsOf(finishes: readonly FuelTenderFinish[]): string[] {
  return finishes
    .filter(
      (finish, at) =>
        finishes.length > 1 && isSameFinish(finish, finishes[(at + 1) % finishes.length]),
    )
    .map((finish) => `tail.finishes: "${finish.name}" repeats on neighbouring steps`)
}

function isSameFinish(a: FuelTenderFinish, b: FuelTenderFinish): boolean {
  return a.name === b.name || a.colour === b.colour
}
