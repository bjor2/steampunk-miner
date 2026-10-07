/**
 * Each player's extractors at work (#142 "Registers": the slice's save section for transient cell
 * state, ticket 237), the `mining-gates` player section v1: the cell the Resonance Fork is tuning
 * and the patches it tuned, the Acid Etcher's marks and how many it sprayed this dive, the
 * Containment Hood's filled canisters, the cell the Induction Coil is pulling, the lump the Aether
 * Tether tows, and when each extractor last worked (the fold-flat pose reads it).
 *
 * Tiles are this planet's, so entering a planet forgets them; the counts refill with the recharge
 * at the dock. A player who never owned an extractor keeps the initial value, out of the state and
 * its digest.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { isJsonObject, isWholeNumber } from '../../../systems/authority/payloadFields'
import {
  readSection,
  withSection,
  type SaveSection,
} from '../../../systems/registries/saveSections'
import type { TilePoint } from '../../../systems/world/tileGrid'

/** The cell a channelled verb works on and the tick it began. */
export interface VerbTarget extends TilePoint {
  sinceTick: number
}

/** Cells of one ore the fork set ringing, drillable until `untilTick`. */
export interface TunedPatch {
  cells: readonly TilePoint[]
  untilTick: number
}

/** A mark's centre; its cells drill normally from `readyAtTick`. */
export interface EtchMark extends TilePoint {
  readyAtTick: number
}

/** The lump on the tether's cable, sold with the hold. */
export interface TowedLump {
  oreId: string
  tier: number
  sinceTick: number
}

/** When an extractor last worked: from its first tick to its last (a channel ends in the future). */
export interface WorkSpan {
  fromTick: number
  toTick: number
}

export interface ExtractorState {
  tuning: VerbTarget | null
  tuned: readonly TunedPatch[]
  marks: readonly EtchMark[]
  marksUsed: number
  canistersUsed: number
  pull: VerbTarget | null
  tow: TowedLump | null
  /** By extractor id, sorted. */
  worked: Readonly<Record<string, WorkSpan>>
}

export const IDLE_EXTRACTORS: ExtractorState = {
  tuning: null,
  tuned: [],
  marks: [],
  marksUsed: 0,
  canistersUsed: 0,
  pull: null,
  tow: null,
  worked: {},
}

export const EXTRACTOR_SECTION: SaveSection<ExtractorState> = {
  id: 'mining-gates',
  version: 1,
  scope: 'player',
  initial: IDLE_EXTRACTORS,
  problems: extractorStateProblems,
  toPortable: (value) => value,
  ofPortable: (body) => body as ExtractorState,
}

export function extractorStateOf(state: AuthorityState, playerId: string): ExtractorState {
  return readSection(state, playerId, EXTRACTOR_SECTION)
}

export function withExtractorState(
  state: AuthorityState,
  playerId: string,
  value: ExtractorState,
): AuthorityState {
  return withSection(state, playerId, EXTRACTOR_SECTION, value)
}

/** The extractor's work span set, the record kept in id order so the digest is one. */
export function withWork(value: ExtractorState, rigId: string, span: WorkSpan): ExtractorState {
  const worked = { ...value.worked, [rigId]: span }
  const sorted = Object.keys(worked)
    .sort()
    .map((id) => [id, worked[id]])
  return { ...value, worked: Object.fromEntries(sorted) as Record<string, WorkSpan> }
}

/** What a planet's tiles meant: tuning, tuned patches, marks and a pull. Counts and the tow stay. */
export function withPlanetForgotten(value: ExtractorState): ExtractorState {
  return { ...value, tuning: null, tuned: [], marks: [], pull: null }
}

function extractorStateProblems(body: unknown): string[] {
  if (!isJsonObject(body)) return ['mining-gates must be an object']
  return [
    ...nullableProblem('tuning', body.tuning, isVerbTarget),
    ...listProblem('tuned', body.tuned, isTunedPatch),
    ...listProblem('marks', body.marks, isEtchMark),
    ...(isWholeNumber(body.marksUsed) ? [] : ['mining-gates.marksUsed must be a whole number']),
    ...(isWholeNumber(body.canistersUsed)
      ? []
      : ['mining-gates.canistersUsed must be a whole number']),
    ...nullableProblem('pull', body.pull, isVerbTarget),
    ...nullableProblem('tow', body.tow, isTowedLump),
    ...workedProblems(body.worked),
  ]
}

function nullableProblem(field: string, value: unknown, isShape: (value: unknown) => boolean) {
  return value === null || isShape(value) ? [] : [`mining-gates.${field} is malformed`]
}

function listProblem(field: string, value: unknown, isShape: (value: unknown) => boolean) {
  return Array.isArray(value) && value.every(isShape) ? [] : [`mining-gates.${field} is malformed`]
}

function workedProblems(worked: unknown): string[] {
  if (!isJsonObject(worked)) return ['mining-gates.worked must be an object']
  return Object.entries(worked)
    .filter(([, span]) => !isWorkSpan(span))
    .map(([rigId]) => `mining-gates.worked.${rigId} must be {fromTick, toTick} whole numbers`)
}

function isTile(value: Record<string, unknown>): boolean {
  return Number.isSafeInteger(value.tx) && Number.isSafeInteger(value.ty)
}

function isVerbTarget(value: unknown): boolean {
  return isJsonObject(value) && isTile(value) && isWholeNumber(value.sinceTick)
}

function isTunedPatch(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    Array.isArray(value.cells) &&
    value.cells.every((cell) => isJsonObject(cell) && isTile(cell)) &&
    isWholeNumber(value.untilTick)
  )
}

function isEtchMark(value: unknown): boolean {
  return isJsonObject(value) && isTile(value) && isWholeNumber(value.readyAtTick)
}

function isTowedLump(value: unknown): boolean {
  return (
    isJsonObject(value) &&
    typeof value.oreId === 'string' &&
    isWholeNumber(value.tier) &&
    isWholeNumber(value.sinceTick)
  )
}

function isWorkSpan(value: unknown): boolean {
  return isJsonObject(value) && isWholeNumber(value.fromTick) && isWholeNumber(value.toTick)
}
